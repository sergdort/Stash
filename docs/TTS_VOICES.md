# Coqui TTS Voices

Stash uses Coqui TTS for text-to-speech conversion. Here are recommended English voices:

## Installation

```bash
pip install TTS
```

## High Quality Single-Speaker Models

These models have one voice but excellent quality:

```bash
# Female voice (default) - very natural
stash tts <id> --voice "tts_models/en/ljspeech/vits"

# Another female voice option
stash tts <id> --voice "tts_models/en/ljspeech/tacotron2-DDC"

# Male voice
stash tts <id> --voice "tts_models/en/ljspeech/glow-tts"
```

## Multi-Speaker Models

VCTK model has 109 different English speakers. Format: `model|speaker_id`

```bash
# List all available speakers (after first download)
tts --model_name tts_models/en/vctk/vits --list_speaker_idxs

# Examples of good speakers:
stash tts <id> --voice "tts_models/en/vctk/vits|p225"  # Female, clear
stash tts <id> --voice "tts_models/en/vctk/vits|p226"  # Male, deep
stash tts <id> --voice "tts_models/en/vctk/vits|p227"  # Male, clear
stash tts <id> --voice "tts_models/en/vctk/vits|p228"  # Female, young
```

## First Time Setup

Models are downloaded automatically on first use. Sizes:
- LJSpeech VITS: ~150MB
- VCTK VITS: ~370MB

## List All Available Models

```bash
tts --list_models | grep "/en/"
```

## Performance Notes

- VITS models are fastest while maintaining quality
- First run downloads the model (one-time)
- Subsequent runs use cached model
- CPU inference is reasonable for articles
- GPU (CUDA) makes it much faster if available