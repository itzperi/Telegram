const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
require('dotenv').config();

// Initialize Express app for health check
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'Bot is running!', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Discord bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('proof')
        .setDescription('Show proof of work with Loom video')
        .addStringOption(option =>
            option.setName('video_url')
                .setDescription('Loom video URL')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description of the work completed')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('client')
                .setDescription('Client name')
                .setRequired(false)
        ),
    
    new SlashCommandBuilder()
        .setName('quickproof')
        .setDescription('Quick proof of work (admin only)')
        .addStringOption(option =>
            option.setName('video_url')
                .setDescription('Loom video URL')
                .setRequired(true)
        ),
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

async function registerCommands() {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Function to extract Loom video ID from URL
function extractLoomVideoId(url) {
    const loomRegex = /loom\.com\/share\/([a-zA-Z0-9]+)/;
    const match = url.match(loomRegex);
    return match ? match[1] : null;
}

// Function to validate Loom URL
function isValidLoomUrl(url) {
    return url.includes('loom.com') && extractLoomVideoId(url) !== null;
}

// Function to create proof of work embed
function createProofEmbed(videoUrl, description, client, user) {
    const videoId = extractLoomVideoId(videoUrl);
    const thumbnailUrl = videoId ? `https://cdn.loom.com/sessions/thumbnails/${videoId}-with-play.gif` : null;
    
    const embed = new EmbedBuilder()
        .setTitle('🎬 Proof of Work Submitted')
        .setDescription(description || 'Work completed - video demonstration attached')
        .setColor(0x6366f1)
        .addFields(
            { name: '👤 Submitted by', value: `${user.displayName || user.username}`, inline: true },
            { name: '🕐 Submitted at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .addFields(
            { name: '🎥 Video Link', value: `[Watch on Loom](${videoUrl})`, inline: false }
        )
        .setFooter({ text: 'Proof of Work System' })
        .setTimestamp();
    
    if (client) {
        embed.addFields({ name: '🏢 Client', value: client, inline: true });
    }
    
    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }
    
    return embed;
}

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    client.user.setActivity('Collecting proof of work', { type: 'WATCHING' });
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'proof') {
        const videoUrl = interaction.options.getString('video_url');
        const description = interaction.options.getString('description');
        const clientName = interaction.options.getString('client');

        // Validate Loom URL
        if (!isValidLoomUrl(videoUrl)) {
            await interaction.reply({
                content: '❌ Please provide a valid Loom video URL (e.g., https://loom.com/share/...)',
                ephemeral: true
            });
            return;
        }

        try {
            const embed = createProofEmbed(videoUrl, description, clientName, interaction.user);
            
            await interaction.reply({
                embeds: [embed],
                content: '✅ Proof of work submitted successfully!'
            });

            // Log the submission
            console.log(`Proof submitted by ${interaction.user.tag}: ${videoUrl}`);
            
        } catch (error) {
            console.error('Error creating proof embed:', error);
            await interaction.reply({
                content: '❌ There was an error processing your proof of work. Please try again.',
                ephemeral: true
            });
        }
    }

    if (commandName === 'quickproof') {
        const videoUrl = interaction.options.getString('video_url');

        // Check if user has admin permissions
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            await interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
            return;
        }

        // Validate Loom URL
        if (!isValidLoomUrl(videoUrl)) {
            await interaction.reply({
                content: '❌ Please provide a valid Loom video URL (e.g., https://loom.com/share/...)',
                ephemeral: true
            });
            return;
        }

        try {
            const embed = createProofEmbed(videoUrl, 'Quick proof of work submission', null, interaction.user);
            
            await interaction.reply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('Error creating quick proof embed:', error);
            await interaction.reply({
                content: '❌ There was an error processing your quick proof. Please try again.',
                ephemeral: true
            });
        }
    }
});

// Handle message commands (fallback)
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Simple message command: !proof <loom_url>
    if (message.content.startsWith('!proof ')) {
        const args = message.content.slice(7).trim();
        
        if (!args || !isValidLoomUrl(args)) {
            message.reply('❌ Please provide a valid Loom video URL after the command.');
            return;
        }

        try {
            const embed = createProofEmbed(args, 'Proof of work submitted via message', null, message.author);
            
            await message.reply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('Error creating proof embed from message:', error);
            message.reply('❌ There was an error processing your proof of work.');
        }
    }
});

// Error handling
client.on('error', console.error);

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Start the bot
async function startBot() {
    try {
        await registerCommands();
        await client.login(process.env.DISCORD_BOT_TOKEN);
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

startBot();
