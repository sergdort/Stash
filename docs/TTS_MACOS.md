# TTS Options for Stash

## Google Text-to-Speech (gTTS) - RECOMMENDED

Much better quality than macOS Say! Uses Google's TTS API.

### Installation

```bash
pip install --user --break-system-packages gtts
```

### Usage

```bash
# Default English
stash tts <id> --format mp3

# Other languages
stash tts <id> --voice "es" --format mp3  # Spanish
stash tts <id> --voice "fr" --format mp3  # French
stash tts <id> --voice "de" --format mp3  # German

# Slower speech
stash tts <id> --voice "en|slow" --format mp3
```

### File Sizes

MP3 files are compressed:
- Short article (3k chars): ~2.4MB
- Long article (13k chars): ~10-12MB

## macOS TTS Voices (Fallback)

Stash currently uses macOS's built-in `say` command for text-to-speech. No installation required!

## Usage

```bash
# Default voice (Samantha)
stash tts <id> --format wav

# Specific voice
stash tts <id> --voice "Alex" --format wav
stash tts <id> --voice "Daniel" --format wav
```

## Available English Voices

- **Alex** (en_US) - Natural male voice, most expressive
- **Samantha** (en_US) - Natural female voice (default)
- **Daniel** (en_GB) - British male
- **Karen** (en_AU) - Australian female
- **Moira** (en_IE) - Irish female
- **Rishi** (en_IN) - Indian male
- **Veena** (en_IN) - Indian female
- **Tessa** (en_ZA) - South African female
- **Victoria** (en_US) - Classic female
- **Fred** (en_US) - Novelty voice

## Format Notes

- **WAV**: Works immediately, larger files
- **MP3**: Requires `ffmpeg` installed (`brew install ffmpeg`)

## File Sizes

WAV files are uncompressed:
- Short article (3k chars): ~8MB
- Long article (13k chars): ~44MB

To reduce size, install ffmpeg for MP3 support:
```bash
brew install ffmpeg
stash tts <id> --format mp3  # Much smaller files
```

## Future Plans

The code includes providers for:
- **Coqui TTS**: High-quality open source (requires Python setup)
- **Edge TTS**: Currently broken (Microsoft changed endpoints)

For now, macOS `say` provides reliable TTS that works out of the box.