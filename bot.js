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
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionsBitField,
} = require('discord.js');

const ROLES = require('./config/roles');
const { generateOtp, verifyOtp } = require('./otpStore');

const TOKEN = process.env.MAIN_DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // optional but recommended for instant command sync

// Adjust these to your actual pages once the site is live.
const MENU_LINK_URL = process.env.SITE_MENU_URL || 'https://your-site.onrender.com';
const VERIFY_INFO_URL = process.env.SITE_VERIFY_URL || 'https://your-site.onrender.com';

if (!TOKEN) {
  console.log('[bot] MAIN_DISCORD_TOKEN not set — Discord bot will not start.');
  module.exports = null;
  return;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged intent — must be enabled in the Dev Portal too
  ],
});

// ---------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('summon')
    .setDescription('เสกข้อความ/การ์ดฟังก์ชันต่างๆ ของเซิร์ฟเวอร์')
    .addSubcommand(sub =>
      sub.setName('information')
        .setDescription('ส่งการ์ดกฎ + ข้อมูล + ปุ่มยืนยันตัวตนของ N\'Meboon Fan Club')
    )
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
// Embeds & components
// ---------------------------------------------------------------
function buildInformationEmbed() {
  return new EmbedBuilder()
    .setColor(0xC8FA5C)
    .setTitle("N'Meboon Fan Club — Rules & Info")
    .setDescription(
      'ยินดีต้อนรับ! กรุณาอ่านกฎก่อนเข้าร่วมครับ\n\n' +
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
      '*GIF & Link → ลบอัตโนมัติ ไม่มีโทษ*\n\n' +
      '🔗 **Links**\n' +
      `📋 [Menu](${MENU_LINK_URL})   ✅ [Verify](${VERIFY_INFO_URL})`
    )
    .setFooter({ text: 'AI + Bot System filter automatically • OTP + Email Verification' });
}

function buildInformationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_start').setLabel('Verify My Account').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('email_verify').setLabel('Email Verify').setEmoji('📧').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('verify_enter_otp').setLabel('ใส่รหัส OTP').setEmoji('🔑').setStyle(ButtonStyle.Primary),
  );
}

function buildItsMeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_itsme').setLabel("It's Me!").setEmoji('✅').setStyle(ButtonStyle.Success),
  );
}

// ---------------------------------------------------------------
// Event: bot ready
// ---------------------------------------------------------------
client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Logged in as ${c.user.tag}`);
  await registerCommands();
});

// ---------------------------------------------------------------
// Event: interactions (slash commands, buttons, modals)
// ---------------------------------------------------------------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ---- /summon information ----
    if (interaction.isChatInputCommand() && interaction.commandName === 'summon') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'information') {
        await interaction.reply({
          embeds: [buildInformationEmbed()],
          components: [buildInformationButtons()],
        });
      }
      return;
    }

    // ---- "Verify My Account" button (posted in the server) ----
    if (interaction.isButton() && interaction.customId === 'verify_start') {
      await interaction.deferReply({ ephemeral: true });

      const member = interaction.member;
      if (member?.roles?.cache?.has(ROLES.MEMBERS.VERIFIED)) {
        await interaction.editReply({ content: '✅ คุณยืนยันตัวตนไปแล้วนะครับ ไม่ต้องทำซ้ำ' });
        return;
      }

      try {
        const dm = await interaction.user.createDM();
        const dmEmbed = new EmbedBuilder()
          .setColor(0xC8FA5C)
          .setTitle('ยืนยันตัวตน — N\'Meboon Fan Club')
          .setDescription('กดปุ่มด้านล่างเพื่อยืนยันว่าเป็นคุณเอง แล้วระบบจะออกรหัส OTP ให้');
        await dm.send({ embeds: [dmEmbed], components: [buildItsMeRow()] });
        await interaction.editReply({ content: '📩 เช็ค DM จากบอทเลยครับ ผมส่งขั้นตอนต่อไปให้แล้ว!' });
      } catch (err) {
        await interaction.editReply({
          content: '❌ ส่งข้อความหา DM ไม่ได้ครับ ช่วยเปิดรับ DM จากสมาชิกในเซิร์ฟเวอร์นี้ก่อน แล้วลองกดใหม่อีกครั้ง',
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
        .setTitle('รหัส OTP ของคุณ')
        .setDescription(
          `\`\`\`${code}\`\`\`\n` +
          `กดที่โค้ดด้านบนเพื่อคัดลอก แล้วกลับไปที่ปุ่ม 🔑 **ใส่รหัส OTP** ในเซิร์ฟเวอร์ วางรหัสนี้ลงไปได้เลย\n\n` +
          `⏳ รหัสนี้จะหมดอายุใน ${minutesLeft} นาที`
        );

      await interaction.update({ embeds: [revealEmbed], components: [] });
      return;
    }

    // ---- "Email Verify" button ----
    if (interaction.isButton() && interaction.customId === 'email_verify') {
      await interaction.reply({ content: '📧 ระบบยืนยันผ่านอีเมลกำลังจะเปิดใช้งานเร็วๆ นี้ครับ ตอนนี้ใช้ Verify My Account ไปก่อนนะ', ephemeral: true });
      return;
    }

    // ---- "ใส่รหัส OTP" button → opens modal ----
    if (interaction.isButton() && interaction.customId === 'verify_enter_otp') {
      const modal = new ModalBuilder().setCustomId('verify_otp_modal').setTitle('ยืนยันรหัส OTP');
      const input = new TextInputBuilder()
        .setCustomId('otp_input')
        .setLabel('วางรหัส OTP ที่ได้รับจาก DM')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('เช่น NMeboon24092026#31664')
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
          not_requested: '❌ ยังไม่พบคำขอ OTP ของคุณ กด "Verify My Account" ก่อนนะครับ',
          expired: '⌛ รหัสหมดอายุแล้ว กด "Verify My Account" เพื่อขอรหัสใหม่',
          mismatch: '❌ รหัสไม่ตรงกัน ลองเช็คแล้ววางใหม่อีกครั้ง (ระวังเว้นวรรค/ตัวอักษรเกิน)',
        };
        await interaction.reply({ content: messages[result.reason] || '❌ ยืนยันไม่สำเร็จ', ephemeral: true });
        return;
      }

      try {
        await interaction.member.roles.add(ROLES.MEMBERS.VERIFIED);
        await interaction.reply({ content: '✅ ยืนยันตัวตนสำเร็จ! ยินดีต้อนรับเข้าสู่ N\'Meboon Fan Club ครับ 🎉', ephemeral: true });
      } catch (err) {
        console.error('[bot] Failed to add Verified role:', err);
        await interaction.reply({
          content: '⚠️ รหัสถูกต้อง แต่บอทให้ยศไม่สำเร็จ (เช็คว่ายศบอทอยู่สูงกว่ายศ Verified และมีสิทธิ์ Manage Roles ไหม) แจ้งแอดมินให้ช่วยดูให้ทีนะครับ',
          ephemeral: true,
        });
      }
      return;
    }
  } catch (err) {
    console.error('[bot] Interaction error:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ เกิดข้อผิดพลาดบางอย่าง ลองใหม่อีกครั้งนะครับ', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);

module.exports = client;
