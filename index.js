import {
    Client, GatewayIntentBits, Events, Partials,
    ActionRowBuilder, StringSelectMenuBuilder,
    EmbedBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionsBitField, ActivityType,
    AttachmentBuilder
} from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs/promises'; // Use promises for fs
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear cliente
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates // Added to handle voice state updates
    ],
    partials: [Partials.Channel]
});

// IDs del servidor
const TOKEN = process.env.TOKEN;
const staffRoleId = '1327461182189207582';
const additionalStaffRoleId = '1327461182189207582';
const adminRoleId = '1367213062305874121';
const categoryChannelId = '1281088637269704747';
const ticketCategoryId = '1281088637269704747';
const welcomeChannelId = '1390078757649514669';
const newMemberRoleId = '1282375812317843590';
const logChannelId = '1345092877499240528';
const triggerVoiceChannelId = '1339817940521844751';
const tempVoiceCategoryId = '1339817940521844749';

// Variables de control
const openTickets = new Set();
const claimedTickets = new Map();
const warns = {};
const tempVoiceChannels = new Map();

function saveWarns() {
    // Aquí deberías guardar los warns en base de datos o archivo
}

// Evento: Bot listo
client.once(Events.ClientReady, () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);

    const updatePresence = () => {
        let totalTickets = 0;
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach(channel => {
                if (channel.name.startsWith('ticket-')) totalTickets++;
            });
        });

        client.user.setPresence({
            activities: [{ name: `🎫 ${totalTickets} tickets`, type: ActivityType.Watching }],
            status: 'online'
        });
    };

    updatePresence();
    setInterval(updatePresence, 60000);
});

// Evento: Anti-links + Warns y Auto-Ban
client.on('messageCreate', async message => {
    // Ignorar mensajes de bots, administradores, el usuario permitido y usuarios con el rol permitido
    if (
        message.author.bot ||
        message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        message.author.id === '1368644528973545634' ||
        message.member.roles.cache.has('1339817939158962197') // ← AÑADIDO
    ) return;

    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/gi;
    if (linkRegex.test(message.content)) {
        const userId = message.author.id;
        const guildId = message.guild.id;
        const key = `${guildId}-${userId}`;

        warns[key] = (warns[key] || 0) + 1;
        saveWarns();

        await message.delete().catch(() => { });

        if (warns[key] >= 3) {
            await message.reply('🚫 Has sido baneado por enviar enlaces después de 3 advertencias.').catch(() => { });
            await message.guild.members.ban(userId, { reason: 'Spam de enlaces no permitidos (3/3 Warns)' }).catch(() => { });

            delete warns[key];
            saveWarns();

            const logChannel = client.channels.cache.get(logChannelId);
            if (logChannel) {
                logChannel.send(`⚠️ ${message.author.tag} fue **baneado** por enviar enlaces después de 3 advertencias.`);
            }
        } else {
            await message.reply(`⚠️ Advertencia ${warns[key]}/3: No puedes enviar enlaces aquí.`).catch(() => { });
        }
    }

    // Comando !warns solo para admins
    if (message.content.startsWith('!warns')) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('No tienes permisos para usar este comando.');
        }

        const user = message.mentions.users.first();
        if (!user) return message.reply('Debes mencionar a un usuario.');

        const key = `${message.guild.id}-${user.id}`;
        const count = warns[key] || 0;

        return message.reply(`📄 El usuario ${user.tag} tiene **${count} warns**.`);
    }
});

// Evento: Bienvenida
client.on(Events.GuildMemberAdd, async member => {
    try {
        const role = member.guild.roles.cache.get(newMemberRoleId);
        if (role) await member.roles.add(role);

        const welcomeChannel = await client.channels.fetch(welcomeChannelId);
        if (welcomeChannel && welcomeChannel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setColor('#db34bf')
                .setTitle('Example | Network')
                .setDescription(
                    'Explora los diferentes canales que tenemos para ti!\n\n' +
                    '• <#1339817939745898584> - Reglas\n' +
                    '• <#1384029575868186685> - Postulaciones\n' +
                    '• <#1384760508288204860> - Tienda'
                )
                .setThumbnail('https://i.ibb.co/RpwS03mh/logoexample.png')
                .addFields(
                    { name: '\u200B', value: `Eres el miembro número **${member.guild.memberCount}** en unirte a nosotros.` }
                )
                .setFooter({ text: 'example | Network', iconURL: 'https://i.ibb.co/RpwS03mh/logoexample.png' });

            await welcomeChannel.send({ content: `<@${member.id}>`, embeds: [embed] });
        }
    } catch (error) {
        console.error('Error al enviar el mensaje de bienvenida:', error);
    }
});

// Evento: Interacciones de Ticket
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        if (openTickets.has(interaction.user.id)) {
            return interaction.reply({ content: 'Ya tienes un ticket abierto.', flags: 64 });
        }

        openTickets.add(interaction.user.id);
        const category = interaction.values[0];

        try {
            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: ticketCategoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] },
                    { id: category === 'Administración' ? adminRoleId : staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel] },
                    { id: additionalStaffRoleId, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            const embed = new EmbedBuilder()
                .setColor('#db34bf')
                .setTitle('🎫 **IGniXS | Ticket Abierto**')
                .setDescription('No abrir ticket sin razón.')
                .addFields(
                    { name: '📄 **Nota**', value: 'Nuestro equipo te asistirá en breve.\nProporciona cualquier detalle adicional necesario.' },
                    { name: '👤 **Solicitante**', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📁 **Categoría**', value: category, inline: true }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim').setLabel('Reclamar').setStyle(ButtonStyle.Primary).setEmoji('👥'),
                new ButtonBuilder().setCustomId('close').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
            );

            await channel.send({ content: `<@&${additionalStaffRoleId}>`, embeds: [embed], components: [row] });
            await interaction.reply({ content: 'Tu ticket ha sido creado.', flags: 64 });
        } catch (error) {
            console.error('Error al crear el ticket:', error);
            openTickets.delete(interaction.user.id);
            await interaction.reply({ content: 'Error al crear el ticket.', flags: 64 });
        }
    }

    if (interaction.isButton()) {
        const { customId, channel, member } = interaction;

        if (customId === 'claim') {
            if (!member.roles.cache.has(staffRoleId) && !member.roles.cache.has(additionalStaffRoleId)) {
                return interaction.reply({ content: 'No autorizado.', flags: 64 });
            }

            if (claimedTickets.has(channel.id)) {
                return interaction.reply({ content: 'Ticket ya reclamado.', flags: 64 });
            }

            claimedTickets.set(channel.id, member.id);
            await channel.permissionOverwrites.edit(additionalStaffRoleId, { ViewChannel: false });
            await channel.permissionOverwrites.create(member.id, { ViewChannel: true });
            await interaction.reply({ content: `Ticket reclamado por <@${member.id}>` });
        }

        if (customId === 'close') {
            if (claimedTickets.get(channel.id) !== member.id &&
                !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'No autorizado para cerrar.', flags: 64 });
            }

            await interaction.reply({ content: 'Cerrando ticket...', flags: 64 });
            openTickets.delete(interaction.user.id);
            claimedTickets.delete(channel.id);

            // Enviar transcripción al canal de logs como archivo .txt
            const messages = await channel.messages.fetch({ limit: 100 });
            const transcript = messages.map(m => `${m.author.tag}: ${m.content}`).reverse().join('\n');
            const filePath = path.join(__dirname, `transcript-${channel.id}.txt`);

            try {
                await fs.writeFile(filePath, transcript);

                const logChannel = client.channels.cache.get(logChannelId);
                if (logChannel) {
                    const attachment = new AttachmentBuilder(filePath);
                    const closeTime = new Date().toLocaleString('es-ES', { timeZone: 'UTC' });
                    await logChannel.send({
                        content: `📄 **Transcripción del Ticket**\nCerrado por: <@${member.id}>\nFecha y hora de cierre: ${closeTime}`,
                        files: [attachment]
                    });
                }

                await fs.unlink(filePath); // Eliminar el archivo después de enviarlo
            } catch (error) {
                console.error('Error al manejar el archivo de transcripción:', error);
            }

            await channel.delete();
        }
    }
});

// Evento: Creación de canal de voz temporal
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    // Check if the user joined the trigger voice channel
    if (newState.channelId === triggerVoiceChannelId && oldState.channelId !== triggerVoiceChannelId) {
        const member = newState.member;
        const guild = newState.guild;

        try {
            // Create a temporary voice channel
            const tempChannel = await guild.channels.create({
                name: `🟢 Canal de ${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: tempVoiceCategoryId, // Use the specified category for temporary channels
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionsBitField.Flags.Connect] }, // Allow everyone to connect
                    { id: member.id, allow: [PermissionsBitField.Flags.Connect] } // Allow the creator to connect
                ]
            });

            // Move the user to the new temporary channel
            await member.voice.setChannel(tempChannel);

            // Store the temporary channel and its creator
            tempVoiceChannels.set(tempChannel.id, member.id);

            // Set a timeout to delete the channel after a period of inactivity
            setTimeout(async () => {
                if (tempChannel.members.size === 0) {
                    await tempChannel.delete().catch(console.error);
                    tempVoiceChannels.delete(tempChannel.id);
                }
            }, 600000); // 10 minutes
        } catch (error) {
            console.error('Error creating temporary voice channel:', error);
        }
    }

    // Check if a user leaves a temporary channel and it's empty
    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const tempChannel = oldState.channel;
        if (tempChannel.members.size === 0) {
            try {
                await tempChannel.delete();
                tempVoiceChannels.delete(tempChannel.id);
            } catch (error) {
                console.error('Error deleting temporary voice channel:', error);
            }
        }
    }
});

// Comandos especiales
client.on('messageCreate', async message => {
    if (message.content === '!ticketsetup') {
        if (openTickets.has(message.author.id)) return message.reply('Ya tienes un ticket abierto.');

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎫 IGniXS | Tickets')
            .setDescription(
                'Selecciona una categoría para abrir un ticket de acuerdo a tu necesidad:\n\n' +
                '🛠️ **¿Necesitas ayuda?**\n' +
                'Si necesitas asistencia o tienes un problema que requiere la intervención de nuestro equipo de staff, no dudes en abrir un ticket.\n\n' +
                '🛡️ **¿Quieres unirte al clan?**\n' +
                'Abre un ticket y completa el proceso de verificación. Nuestro equipo evaluará tu solicitud para unirte a la familia.\n\n' +          
                '🤝 **¿Buscas formar una alianza?**\n' +
                'Si representas a otro clan y deseas una alianza oficial, abre un ticket seleccionando la categoría de alianzas. Te responderemos lo antes posible.\n\n' +

                '⚠️ **Abrir ticket sin razón llevará sanción**'
            )
            .setImage("https://cdn.discordapp.com/attachments/1345092877499240528/1392192801889849394/standard.gif?ex=686ff595&is=686ea415&hm=9804d635250a088c8f80b0e10a6789dcf4df2c442c768e555cb05f6cd37166fd&");

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_select')
            .setPlaceholder('Selecciona una categoría')
            .addOptions(
                { label: '❓ Soporte General', value: 'Dudas', description: 'Soporte General para cualquier duda.' },
                { label: '🛡️  Unirse al Clan', value: 'Verificación', description: 'Verificación para ingresar.' },
                { label: '🤝 Formar Alianzas', value: 'Alianzas', description: 'Para Formar una alianza.' },
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await message.channel.send({ embeds: [embed], components: [row] });
    }

    if (message.content.startsWith('!nsay')) {
        if (!message.member.roles.cache.has(adminRoleId)) {
            return message.reply('Solo los administradores pueden usar este comando.');
        }

        const content = message.content.slice(6).trim();
        if (!content) return message.reply('Escribe el mensaje a enviar. Ejemplo: `!nsay Hola!`');

        await message.delete().catch(() => { });
        message.channel.send(content);
    }

    if (message.content === '!ip') {
        const embed = new EmbedBuilder()
            .setColor('#db34bf')
            .setTitle('🌐 **Example Network**')
            .setDescription('Aquí tienes la IP y estado actual:')
            .addFields(
                { name: 'IP', value: 'play.example.xyz', inline: true },
                { name: 'Puerto', value: '25577', inline: true },
                { name: 'Compatibilidad', value: 'Java y Bedrock', inline: true }
            )
            .setFooter({ text: '¡Que esperas unirte!' })
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
});

client.login(TOKEN);