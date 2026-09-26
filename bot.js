const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

const { addXp, getLeaderboard, resetPeriod, getMonthKey, getYearKey, getLastMonthKey, setLastMonthKey, getLastYearKey, setLastYearKey } = require('./levelSystem');
const { moderateMessage } = require('./moderation');
const region = require('./region');
const faqEngine = require('./faqEngine');

const ROLES = {
  MANAGEMENT: {
    OWNER: '1261866506166337618',
    ADMIN: '1261866284401037403',
    BOT_AI: '1261889435012698223',
  },
  CREATORS: {
    SUBS_1K_PLUS: '1491447911836553296',
    MAIN_YOUTUBER: '1491449361106735114',
  },
  MEMBERS: {
    FANCLUB: '1264435927002906717',
    VERIFIED: '1358283709912059945',
    FULLY_VERIFIED: '1511707194087968958',
    EARLY_SUPPORTER: '1532366386788306965',
  },
  LOYALTY: {
    NEWBIE: '1532369438211444927',        // 0–3 Months
    REGULAR: '1532369634450341918',       // 3–6 Months
    VETERAN: '1532369703882850334',       // 6–12 Months
    ELITE: '1532369773441061007',         // 1–1.5 Years
    LEGEND: '1532369842219258019',        // 1.5+ Years
  },
};
const { generateOtp, verifyOtp } = require('./otpStore');

const TOKEN = process.env.MAIN_DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // optional but recommended for instant command sync

// Adjust these to your actual pages once the site is live.
const MENU_LINK_URL = process.env.SITE_MENU_URL || 'https://meboonmenulink.carrd.co';
const VERIFY_INFO_URL = process.env.SITE_VERIFY_URL || 'https://n-meboon-service.onrender.com/Login';

// Level system channels — defaults match what was given; override via env if needed.
const LEVEL_UP_CHANNEL_ID = process.env.LEVEL_UP_CHANNEL_ID || '1504461180863905932';
const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID || LEVEL_UP_CHANNEL_ID;
const MOD_ALERT_CHANNEL_ID = process.env.MOD_ALERT_CHANNEL_ID || '1500139152098722053';
const FEEDBACK_CHANNEL_ID = process.env.FEEDBACK_CHANNEL_ID || '1492844552296337529';
const QUESTION_TIME_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

const MESSAGE_XP = 1;
const VOICE_XP_PER_MINUTE = 10;
const VOICE_TICK_MS = 60 * 1000;
const LEADERBOARD_CHECK_MS = 60 * 60 * 1000; // check hourly for month/year rollover

if (!TOKEN) {
  console.log('[bot] MAIN_DISCORD_TOKEN not set — Discord bot will not start.');
  module.exports = null;
  return;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // privileged — must be enabled in the Dev Portal too
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — must be enabled in the Dev Portal too
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ---------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('summon')
    .setDescription('Summon a card for the server')
    .addStringOption(opt =>
      opt.setName('card')
        .setDescription('Which card to summon')
        .setRequired(true)
        .addChoices(
          { name: 'Information', value: 'information' },
          { name: 'Region', value: 'region' },
          { name: 'Feedback', value: 'feedback' },
        )
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('region-audit')
    .setDescription('DM the region picker to every member who has no continent/country role yet')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    if (GUILD_ID && CLIENT_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('[bot] Slash commands registered to guild (instant).');
    } else if (CLIENT_ID) {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('[bot] Slash commands registered globally (can take up to ~1 hour to show up).');
    } else {
      console.log('[bot] DISCORD_CLIENT_ID not set — skipped slash command registration.');
    }
  } catch (err) {
    console.error('[bot] Failed to register slash commands:', err);
  }
}

// ---------------------------------------------------------------
// Embeds & components — Rules/Info card
// ---------------------------------------------------------------
function buildInformationEmbed() {
  return new EmbedBuilder()
    .setColor(0xC8FA5C)
    .setTitle("N'Meboon Fan Club — Rules & Info")
    .setDescription(
      'Welcome! Please read the rules before joining in.\n\n' +
      '🟢 **Level : Low**  (> #90fda7)\n' +
      '> No spam\n' +
      '> GIFs not allowed\n' +
      '> Ping not allowed\n\n' +
      '🟡 **Level : Mid**  (> #ffe57f)\n' +
      '> Moderate content is acceptable\n' +
      '> Links not allowed\n\n' +
      '🔴 **Level : High**  (> #ff6767)\n' +
      '> Violence not allowed\n' +
      '> NSFW not allowed\n' +
      '> System detects automatically — admins+bots review later\n\n' +
      '⚠️ **Penalty**\n' +
      '`Low` < 15 pts → Mute Chat/Voice **3–60 Min**\n' +
      '`Mid` < 10 pts → Mute **5–180 Min**\n' +
      '`High` < 5 pts → Mute **10 Min or 48 Hours**\n\n' +
      '*GIF & Link → auto-deleted, no penalty*\n\n' +
      '🔗 **Links**\n' +
      `📋 [Menu](${MENU_LINK_URL})   ✅ [Verify](${VERIFY_INFO_URL})`
    )
    .setFooter({ text: 'AI + Bot System filter automatically • OTP + Email Verification' });
}

function buildInformationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_start').setLabel('Verify My Account').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('email_verify').setLabel('Email Verify').setEmoji('📧').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('verify_enter_otp').setLabel('Enter OTP').setEmoji('🔑').setStyle(ButtonStyle.Primary),
  );
}

function buildItsMeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_itsme').setLabel("It's Me!").setEmoji('✅').setStyle(ButtonStyle.Success),
  );
}

// ---------------------------------------------------------------
// Embeds & components — Feedback card
// ---------------------------------------------------------------
function buildFeedbackEmbed() {
  return new EmbedBuilder()
    .setColor(0x37AEFF)
    .setTitle('🧷 Feedback & Support')
    .setDescription(
      "Got a suggestion, question, or found a bug? Send it here!\n\n" +
      "**Feedback** — share an idea or suggestion\n" +
      "**Report an Issue** — tell us about a bug or problem\n" +
      "**Question** — opens a private channel where our keyword-based helper bot " +
      "will try to answer from our knowledge base for 5 minutes"
    )
    .setFooter({ text: 'Feedback and reports go straight to the team.' });
}

function buildFeedbackButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('feedback_open').setLabel('Feedback').setEmoji('🧷').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('report_open').setLabel('Report an Issue').setEmoji('🐛').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('question_open').setLabel('Question').setEmoji('❓').setStyle(ButtonStyle.Secondary),
  );
}

function buildFeedbackModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId('feedback_text')
    .setLabel('Describe it here')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Type as much detail as you can...')
    .setRequired(true)
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

// ---------------------------------------------------------------
// Nickname leveling — keeps "<nickname> Lv<N>" in sync automatically.
// Bots can never change the server owner's nickname (Discord platform
// rule) — that failure is caught and ignored, not a bug.
// ---------------------------------------------------------------
function stripLevelSuffix(name) {
  return name.replace(/\s*Lv\d+\s*$/i, '').trim();
}

async function syncNicknameLevel(member, level) {
  try {
    const base = stripLevelSuffix(member.nickname || member.user.username);
    const suffix = ` Lv${level}`;
    const maxBaseLen = 32 - suffix.length;
    const trimmedBase = base.length > maxBaseLen ? base.slice(0, maxBaseLen).trim() : base;
    const desired = `${trimmedBase}${suffix}`;

    if (member.nickname === desired) return; // already correct, skip the API call
    await member.setNickname(desired);
  } catch (err) {
    // Most common cause: trying to rename the server owner, or the bot's
    // role isn't above this member's highest role. Not fatal — skip it.
    console.log(`[bot] Could not update nickname for ${member.id}: ${err.message}`);
  }
}

// ---------------------------------------------------------------
// Embeds & components — Region picker
// ---------------------------------------------------------------
function buildRegionEmbed() {
  return new EmbedBuilder()
    .setColor(0xC8FA5C)
    .setTitle('🌍 Pick Your Region')
    .setDescription(
      "Choose the continent and country closest to you — this helps us know the community's timezones better!\n\n" +
      "Discord doesn't let bots detect your real location automatically, so please pick it yourself below. " +
      "You can change your selection anytime by using the menus again."
    );
}

function buildRegionComponents() {
  const continentMenu = new StringSelectMenuBuilder()
    .setCustomId('region_continent_select')
    .setPlaceholder('Select your continent')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Asia', value: region.CONTINENTS.ASIA, emoji: '🌏' },
      { label: 'Europe', value: region.CONTINENTS.EUROPE, emoji: '🌍' },
      { label: 'America', value: region.CONTINENTS.AMERICA, emoji: '🌎' },
    );

  const countryMenu = new StringSelectMenuBuilder()
    .setCustomId('region_country_select')
    .setPlaceholder('Select your country')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Thailand', value: region.COUNTRIES.THAILAND, emoji: '🇹🇭' },
      { label: 'Japan', value: region.COUNTRIES.JAPAN, emoji: '🇯🇵' },
      { label: 'USA', value: region.COUNTRIES.USA, emoji: '🇺🇸' },
      { label: 'Other', value: region.COUNTRIES.OTHER, emoji: '🌐' },
    );

  return [
    new ActionRowBuilder().addComponents(continentMenu),
    new ActionRowBuilder().addComponents(countryMenu),
  ];
}

// Best-effort, silent, one-time locale guess — never overrides a real choice.
async function maybeGuessRegion(interaction) {
  try {
    if (!interaction.guild || !interaction.member) return;
    if (region.hasAnyRegionRole(interaction.member)) return;

    const guess = region.guessFromLocale(interaction.locale);
    if (!guess) return;

    await region.setRegionRoles(interaction.member, { continentId: guess.continent, countryId: guess.country });
    console.log(`[bot] Auto-guessed region for ${interaction.user.tag} from locale "${interaction.locale}"`);
  } catch (err) {
    console.error('[bot] Region guess failed:', err.message);
  }
}

// ---------------------------------------------------------------
// Level system helpers
// ---------------------------------------------------------------
async function announceLevelUp(userId, newLevel) {
  try {
    const channel = await client.channels.fetch(LEVEL_UP_CHANNEL_ID);
    await channel.send(`<@${userId}> Up to Level ${newLevel}!!!`);
  } catch (err) {
    console.error('[bot] Failed to send level-up message:', err.message);
  }
}

async function handleXpGain(member, amount) {
  const result = addXp(member.id, amount);
  if (result.leveledUp) {
    await announceLevelUp(member.id, result.newLevel);
    await syncNicknameLevel(member, result.newLevel);
  }
}

async function postLeaderboard(period, title) {
  const top = getLeaderboard(period, 50);
  if (top.length === 0) return; // nobody earned XP this period — nothing to show

  const lines = top.map((entry, i) => `[${i + 1}] <@${entry.userId}> Level ${entry.level} XP ${entry.xp}`);
  const embed = new EmbedBuilder()
    .setColor(0xC8FA5C)
    .setTitle(title)
    .setDescription(lines.join('\n'));

  try {
    const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[bot] Failed to post leaderboard:', err.message);
  }
}

async function checkLeaderboardRollover() {
  const now = new Date();
  const monthKey = getMonthKey(now);
  const yearKey = getYearKey(now);

  const lastMonth = getLastMonthKey();
  if (lastMonth === null) {
    setLastMonthKey(monthKey); // first boot — just record baseline, don't announce
  } else if (lastMonth !== monthKey) {
    await postLeaderboard('monthlyXp', '🏆 Monthly Top 50 — XP Leaderboard');
    resetPeriod('monthlyXp');
    setLastMonthKey(monthKey);
  }

  const lastYear = getLastYearKey();
  if (lastYear === null) {
    setLastYearKey(yearKey);
  } else if (lastYear !== yearKey) {
    await postLeaderboard('yearlyXp', '🎉 Yearly Top 50 — XP Leaderboard');
    resetPeriod('yearlyXp');
    setLastYearKey(yearKey);
  }
}

async function tickVoiceXp() {
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
      for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        await handleXpGain(member, VOICE_XP_PER_MINUTE);
      }
    }
  }
}

// ---------------------------------------------------------------
// Event: bot ready
// ---------------------------------------------------------------
client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Logged in as ${c.user.tag}`);
  await registerCommands();
  await checkLeaderboardRollover();
  setInterval(tickVoiceXp, VOICE_TICK_MS);
  setInterval(checkLeaderboardRollover, LEADERBOARD_CHECK_MS);
});

// ---------------------------------------------------------------
// Event: new member joins — invite them to pick their region
// ---------------------------------------------------------------
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  try {
    const dm = await member.createDM();
    await dm.send({ embeds: [buildRegionEmbed()], components: buildRegionComponents() });
  } catch (err) {
    console.log(`[bot] Could not DM region picker to ${member.user.tag} (DMs likely closed).`);
  }
});

// ---------------------------------------------------------------
// Event: messages — moderation + chat XP
// ---------------------------------------------------------------
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    const verdict = moderateMessage(message);

    if (verdict.action === 'delete_silent') {
      await message.delete().catch(() => {});
      return; // no XP, no warning — matches "GIF & Link → auto-deleted, no penalty"
    }

    if (verdict.action === 'warn') {
      const channel = await client.channels.fetch(MOD_ALERT_CHANNEL_ID).catch(() => null);
      if (channel) {
        await channel.send(
          `⚠️ **[${verdict.rule} level warning]** <@${message.author.id}> — ${verdict.reason}. ` +
          `Please review the server rules in the rules channel and keep the chat respectful.`
        );
      }
      return; // flagged messages don't earn XP
    }

    await handleXpGain(message.member ?? await message.guild.members.fetch(message.author.id), MESSAGE_XP);
  } catch (err) {
    console.error('[bot] Message handling error:', err.message);
  }
});

// ---------------------------------------------------------------
// Event: interactions (slash commands, buttons, modals, select menus)
// ---------------------------------------------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Opportunistic, silent, one-time region guess for anyone who hasn't
    // picked a region yet — skipped for the region picker's own menus.
    if (!(interaction.isStringSelectMenu() && interaction.customId.startsWith('region_'))) {
      await maybeGuessRegion(interaction);
    }

    // ---- /summon ----
    if (interaction.isChatInputCommand() && interaction.commandName === 'summon') {
      const card = interaction.options.getString('card');

      if (card === 'information') {
        await interaction.reply({
          embeds: [buildInformationEmbed()],
          components: [buildInformationButtons()],
        });
        return;
      }

      if (card === 'region') {
        await interaction.reply({
          embeds: [buildRegionEmbed()],
          components: buildRegionComponents(),
        });
        return;
      }

      if (card === 'feedback') {
        await interaction.reply({
          embeds: [buildFeedbackEmbed()],
          components: [buildFeedbackButtons()],
        });
        return;
      }
      return;
    }

    // ---- /region-audit ----
    if (interaction.isChatInputCommand() && interaction.commandName === 'region-audit') {
      await interaction.deferReply({ ephemeral: true });
      const members = await interaction.guild.members.fetch();
      let dmed = 0;
      let skippedHasRole = 0;
      let failed = 0;

      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (region.hasAnyRegionRole(member)) { skippedHasRole++; continue; }
        try {
          const dm = await member.createDM();
          await dm.send({ embeds: [buildRegionEmbed()], components: buildRegionComponents() });
          dmed++;
        } catch {
          failed++;
        }
      }

      await interaction.editReply({
        content: `✅ Region audit complete.\n` +
          `📨 DMed: ${dmed}\n` +
          `✔️ Already had a region: ${skippedHasRole}\n` +
          `❌ Couldn't DM (DMs closed): ${failed}`,
      });
      return;
    }

    // ---- Region select menus ----
    if (interaction.isStringSelectMenu() && interaction.customId === 'region_continent_select') {
      const continentId = interaction.values[0];
      const member = interaction.member ?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "This only works inside the server, not in DMs — please use `/summon region` in the server, or join a mutual server with me first.", ephemeral: true });
        return;
      }
      await region.setRegionRoles(member, { continentId });
      await interaction.reply({ content: `✅ Continent set!`, ephemeral: true }).catch(async () => {
        await interaction.update({}).catch(() => {});
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'region_country_select') {
      const countryId = interaction.values[0];
      const member = interaction.member ?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "This only works inside the server, not in DMs — please use `/summon region` in the server, or join a mutual server with me first.", ephemeral: true });
        return;
      }
      await region.setRegionRoles(member, { countryId });
      await interaction.reply({ content: `✅ Country set!`, ephemeral: true }).catch(() => {});
      return;
    }

    // ---- "Verify My Account" button (posted in the server) ----
    if (interaction.isButton() && interaction.customId === 'verify_start') {
      await interaction.deferReply({ ephemeral: true });

      const member = interaction.member;
      if (member?.roles?.cache?.has(ROLES.MEMBERS.VERIFIED)) {
        await interaction.editReply({ content: "✅ You're already verified — no need to do it again." });
        return;
      }

      try {
        const dm = await interaction.user.createDM();
        const dmEmbed = new EmbedBuilder()
          .setColor(0xC8FA5C)
          .setTitle("Verify Your Account — N'Meboon Fan Club")
          .setDescription('Click the button below to confirm it\'s really you — the system will then issue you an OTP code.');
        await dm.send({ embeds: [dmEmbed], components: [buildItsMeRow()] });
        await interaction.editReply({ content: '📩 Check your DMs — I\'ve sent you the next step!' });
      } catch (err) {
        await interaction.editReply({
          content: "❌ I couldn't DM you. Please enable DMs from server members and try again.",
        });
      }
      return;
    }

    // ---- "It's Me!" button (clicked inside the DM) ----
    if (interaction.isButton() && interaction.customId === 'verify_itsme') {
      const { code, expiresAt } = generateOtp(interaction.user);
      const minutesLeft = Math.round((expiresAt - Date.now()) / 60000);

      const revealEmbed = new EmbedBuilder()
        .setColor(0xC8FA5C)
        .setTitle('Your OTP Code')
        .setDescription(
          `\`\`\`${code}\`\`\`\n` +
          `Tap the code above to copy it, then go back to the 🔑 **Enter OTP** button in the server and paste it in.\n\n` +
          `⏳ This code expires in ${minutesLeft} minutes.`
        );

      await interaction.update({ embeds: [revealEmbed], components: [] });
      return;
    }

    // ---- "Email Verify" button ----
    if (interaction.isButton() && interaction.customId === 'email_verify') {
      await interaction.reply({ content: '📧 Email verification is coming soon! For now, please use Verify My Account instead.', ephemeral: true });
      return;
    }

    // ---- "Enter OTP" button → opens modal ----
    if (interaction.isButton() && interaction.customId === 'verify_enter_otp') {
      const modal = new ModalBuilder().setCustomId('verify_otp_modal').setTitle('Verify OTP Code');
      const input = new TextInputBuilder()
        .setCustomId('otp_input')
        .setLabel('Paste the OTP code you received in DMs')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. NMeboon24092026#31664')
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ---- OTP modal submit ----
    if (interaction.isModalSubmit() && interaction.customId === 'verify_otp_modal') {
      const submitted = interaction.fields.getTextInputValue('otp_input');
      const result = verifyOtp(interaction.user.id, submitted);

      if (!result.ok) {
        const messages = {
          not_requested: '❌ No pending OTP request found for you. Please click "Verify My Account" first.',
          expired: '⌛ This code has expired. Click "Verify My Account" to request a new one.',
          mismatch: '❌ That code doesn\'t match. Double-check and paste it again (watch for extra spaces/characters).',
        };
        await interaction.reply({ content: messages[result.reason] || '❌ Verification failed.', ephemeral: true });
        return;
      }

      try {
        await interaction.member.roles.add(ROLES.MEMBERS.VERIFIED);
        await interaction.reply({ content: "✅ Verification successful! Welcome to N'Meboon Fan Club 🎉", ephemeral: true });
      } catch (err) {
        console.error('[bot] Failed to add Verified role:', err);
        await interaction.reply({
          content: "⚠️ Your code was correct, but I couldn't assign the role (check that my role is above @Verified and I have Manage Roles). Please ping an admin for help.",
          ephemeral: true,
        });
      }
      return;
    }

    // ---- "Feedback" button → modal ----
    if (interaction.isButton() && interaction.customId === 'feedback_open') {
      await interaction.showModal(buildFeedbackModal('feedback_modal', 'Send Feedback'));
      return;
    }

    // ---- "Report an Issue" button → modal ----
    if (interaction.isButton() && interaction.customId === 'report_open') {
      await interaction.showModal(buildFeedbackModal('report_modal', 'Report an Issue'));
      return;
    }

    // ---- Feedback / Report modal submit → forward to the team channel ----
    if (interaction.isModalSubmit() && (interaction.customId === 'feedback_modal' || interaction.customId === 'report_modal')) {
      const isReport = interaction.customId === 'report_modal';
      const text = interaction.fields.getTextInputValue('feedback_text');

      try {
        const channel = await client.channels.fetch(FEEDBACK_CHANNEL_ID);
        const embed = new EmbedBuilder()
          .setColor(isReport ? 0xFF5C5C : 0x37AEFF)
          .setTitle(isReport ? '🐛 New Bug Report' : '🧷 New Feedback')
          .setDescription(text)
          .addFields({ name: 'From', value: `<@${interaction.user.id}> (${interaction.user.tag})` })
          .setTimestamp();
        await channel.send({ embeds: [embed] });
        await interaction.reply({ content: `✅ Thanks! Your ${isReport ? 'report' : 'feedback'} has been sent to the team.`, ephemeral: true });
      } catch (err) {
        console.error('[bot] Failed to forward feedback:', err.message);
        await interaction.reply({ content: "⚠️ Couldn't send that right now — please try again later.", ephemeral: true });
      }
      return;
    }

    // ---- "Question" button → create a temporary Q&A channel ----
    if (interaction.isButton() && interaction.customId === 'question_open') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const channel = await interaction.guild.channels.create({
          name: `question-${interaction.user.username}`.toLowerCase().slice(0, 90),
          type: ChannelType.GuildText,
          parent: interaction.channel?.parentId || undefined,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
          ],
        });

        await channel.send({
          content: `<@${interaction.user.id}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(0x37AEFF)
              .setTitle('❓ Ask your question')
              .setDescription(
                "You have **5 minutes** to ask your question here. I'll try to answer using our knowledge base.\n\n" +
                "Note: I'm a simple keyword-matching helper, not a real conversational AI — I work best with direct " +
                "questions about server rules, verification, leveling, etc. This channel auto-deletes when time's up."
              ),
          ],
        });

        await interaction.editReply({ content: `✅ Created ${channel} — you have 5 minutes to ask!` });

        const collector = channel.createMessageCollector({
          filter: (m) => m.author.id === interaction.user.id,
          time: QUESTION_TIME_LIMIT_MS,
        });

        collector.on('collect', async (msg) => {
          const result = faqEngine.answer(msg.content);
          await channel.send(result.answer).catch(() => {});
        });

        collector.on('end', async () => {
          await channel.send("⏳ Time's up! This channel will be deleted shortly.").catch(() => {});
          setTimeout(() => channel.delete().catch(() => {}), 10000);
        });
      } catch (err) {
        console.error('[bot] Failed to create question channel:', err.message);
        await interaction.editReply({ content: "⚠️ I couldn't create a question channel (check my Manage Channels permission). Please ping an admin." });
      }
      return;
    }
  } catch (err) {
    console.error('[bot] Interaction error:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ Something went wrong. Please try again.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);

module.exports = client;
