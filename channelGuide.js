// Guild ID used to build Discord deep-links (https://discord.com/channels/{guild}/{channel}).
// Falls back to DISCORD_GUILD_ID if you ever move servers.
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1261821685976400003';

function link(channelId) {
  return `https://discord.com/channels/${GUILD_ID}/${channelId}`;
}

const CHANNEL_GUIDE = [
  {
    category: '❗ IMPORTANT',
    entries: [
      { label: 'Server Setup', channelId: '1358274280080801942', desc: 'Server setup info, how things work here, and news updates.' },
      { label: 'Fan Club Welcome', channelId: '1358317033812394065', desc: 'Where fan club members get welcomed.' },
      { label: 'Uploads', channelId: '1484553528533061832', desc: 'Uploads shared from various channels/platforms.' },
      { label: 'Promotions', channelId: '1549443582270775427', desc: "Promotions, ads, and sponsors — support us here if you'd like! >w<" },
    ],
  },
  {
    category: '🍌 Basic Chat',
    entries: [
      { label: 'General Chat', channelId: '1358313808258666757', desc: 'Casual chat — just keep it within the rules.' },
      { label: 'General Chat 2', channelId: '1552996514765479957', desc: 'Casual chat — just keep it within the rules.' },
      { label: 'Fan Art', channelId: '1358313999560736911', desc: 'Share your fan art here (no inappropriate images).' },
      { label: 'Level-Up', channelId: '1504461180863905932', desc: "Check everyone's Level here." },
    ],
  },
  {
    category: '💬 Feedbacks',
    entries: [
      { label: 'Tutorial', channelId: '1525545662467543240', desc: 'Tutorials on how to do things.' },
      { label: 'Feedback & Bugs', channelId: '1492838914791182509', desc: 'Report bugs or share feedback — you can ask questions here too.' },
    ],
  },
  {
    category: '🧊 Chill Zone',
    entries: [
      { label: 'Chill Voice', channelId: '1486495099314634853', desc: 'Voice channel for chatting quietly.' },
      { label: 'Music Voice', channelId: '1486496068295331932', desc: 'Chill background music — great for reading, studying, sleeping, or relaxing.' },
    ],
  },
];

const CREDITS = {
  music: '🎵 BGM: モナカの音楽室',
  adminIds: ['1223489732307058848', '1329674430296752150'],
};

module.exports = { GUILD_ID, link, CHANNEL_GUIDE, CREDITS };
