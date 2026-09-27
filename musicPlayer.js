// Plays the music-*.mp3 files in the project root as a continuously looping
// playlist, crossfading between every consecutive track using FFmpeg's
// built-in `acrossfade` filter (a proper audio crossfade — not a hand-rolled
// PCM mixer). The whole playlist is chained into ONE ffmpeg process that
// streams raw PCM straight into the Discord voice connection.
//
// Add/remove songs by adding/removing "music-*" files at the project root
// (see MUSIC_FILE_PATTERN below) — name them with a numeric prefix
// (music-01-, music-02-, ...) to control play order, since files are
// played in alphabetical filename order.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

// Music files live directly in the project root (same folder as this file)
// with a "music-" prefix — e.g. music-01-song.mp3, music-02-song.mp3 —
// deliberately NOT in a subfolder, since binary files (audio/video) can't
// be moved into a new folder through GitHub's mobile web editor. Add/
// remove songs by adding/removing "music-*" files at the project root;
// the numeric prefix controls play order (files are sorted alphabetically).
const MUSIC_DIR = __dirname;
const CROSSFADE_SECONDS = 3;
const MUSIC_FILE_PATTERN = /^music-.*\.(mp3|wav|ogg|m4a|flac)$/i;

function getPlaylist() {
  if (!fs.existsSync(MUSIC_DIR)) return [];
  return fs.readdirSync(MUSIC_DIR)
    .filter((f) => MUSIC_FILE_PATTERN.test(f))
    .sort()
    .map((f) => path.join(MUSIC_DIR, f));
}

/**
 * Builds the ffmpeg argument list that chains every track in `files`
 * together with an acrossfade transition between each consecutive pair,
 * outputting raw PCM (48kHz stereo s16le) on stdout — the exact format
 * @discordjs/voice expects for StreamType.Raw.
 */
function buildFfmpegArgs(files) {
  const inputArgs = [];
  files.forEach((f) => inputArgs.push('-i', f));

  const outputArgs = ['-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];

  if (files.length === 1) {
    // Nothing to crossfade — just decode the one track. `-vn` drops the
    // embedded cover-art image stream some of these files have.
    return ['-i', files[0], '-vn', ...outputArgs];
  }

  // Normalize every input's AUDIO stream (explicitly [i:a], since these
  // files also carry an embedded cover-art image stream) to a consistent
  // format first, so acrossfade never chokes on mismatched inputs.
  const normalize = files.map(
    (_, i) => `[${i}:a]aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo[n${i}]`
  );

  const crossfades = [];
  let prevLabel = 'n0';
  for (let i = 1; i < files.length; i++) {
    const outLabel = i === files.length - 1 ? 'out' : `x${i}`;
    crossfades.push(`[${prevLabel}][n${i}]acrossfade=d=${CROSSFADE_SECONDS}:c1=tri:c2=tri[${outLabel}]`);
    prevLabel = outLabel;
  }

  const filterComplex = [...normalize, ...crossfades].join(';');

  return [...inputArgs, '-filter_complex', filterComplex, '-map', '[out]', ...outputArgs];
}

class MusicPlayer {
  constructor() {
    this.player = createAudioPlayer();
    this.connection = null;
    this.ffmpegProcess = null;
    this.isPlaying = false;
    this.shouldPlay = false;

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.isPlaying = false;
      if (this.shouldPlay) this._startStream(); // loop the whole playlist again
    });
    this.player.on('error', (err) => {
      console.error('[music] AudioPlayer error:', err.message);
    });
  }

  connect(channel) {
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.connection.subscribe(this.player);

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
        // Blip / reconnect handled automatically by discord.js — do nothing.
      } catch {
        // Genuine disconnect — rejoin from scratch to honor "stay forever".
        this.reconnect(channel);
      }
    });
  }

  reconnect(channel) {
    try { this.connection?.destroy(); } catch {}
    this.connect(channel);
    if (this.shouldPlay) this._startStream();
  }

  _startStream() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;
    }
    const files = getPlaylist();
    if (files.length === 0) {
      console.log('[music] No audio files found in /music — nothing to play.');
      return;
    }

    const args = buildFfmpegArgs(files);
    this.ffmpegProcess = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.ffmpegProcess.on('error', (err) => console.error('[music] ffmpeg failed to start:', err.message));
    // Uncomment while debugging audio issues:
    // this.ffmpegProcess.stderr.on('data', (d) => console.log('[ffmpeg]', d.toString()));

    const resource = createAudioResource(this.ffmpegProcess.stdout, { inputType: StreamType.Raw });
    this.player.play(resource);
    this.isPlaying = true;
  }

  /** Start (or resume) playback — safe to call repeatedly; won't restart an already-playing stream. */
  start() {
    this.shouldPlay = true;
    if (!this.isPlaying) this._startStream();
  }

  /** Pause playback (bot stays connected to the channel). */
  pause() {
    this.shouldPlay = false;
    if (this.ffmpegProcess) { this.ffmpegProcess.kill('SIGKILL'); this.ffmpegProcess = null; }
    this.player.stop();
    this.isPlaying = false;
  }
}

module.exports = { MusicPlayer, getPlaylist, buildFfmpegArgs };
