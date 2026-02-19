# Setting Up Coqui TTS with pyenv

Once pyenv is installed, here's how to get Coqui TTS working:

## 1. Configure pyenv

Add to your ~/.zshrc:
```bash
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
```

Then reload:
```bash
source ~/.zshrc
```

## 2. Install Python 3.11

```bash
# List available Python versions
pyenv install --list | grep " 3.11"

# Install Python 3.11
pyenv install 3.11.9

# Create a virtual environment
pyenv virtualenv 3.11.9 coqui-tts

# Activate it
pyenv activate coqui-tts
```

## 3. Install Coqui TTS

```bash
pip install TTS
```

## 4. Install phonemizer backend (required on macOS)

Coqui models such as `tts_models/en/ljspeech/vits` require an eSpeak backend.

```bash
brew install espeak-ng
espeak-ng --version
```

Set the eSpeak library path for the current shell:

```bash
export PHONEMIZER_ESPEAK_LIBRARY="$(brew --prefix espeak-ng)/lib/libespeak-ng.dylib"
```

Persist it for future shells:

```bash
echo 'export PHONEMIZER_ESPEAK_LIBRARY="$(brew --prefix espeak-ng)/lib/libespeak-ng.dylib"' >> ~/.zshrc
source ~/.zshrc
```

## 5. Test Coqui

```bash
# List available models
tts --list_models

# Test with default model (pass text directly)
tts --text "Hello world" --out_path test.wav

# Test with high quality model
tts --model_name tts_models/en/ljspeech/vits --text "Hello world" --out_path test.wav
```

If you want to use piped input, convert it to a normal argument:

```bash
echo "Hello world" | xargs -I {} tts --text "{}" --out_path test.wav
```

If you see this error:

```text
Exception: [!] No espeak backend found. Install espeak-ng or espeak to your system.
```

verify the dylib exists:

```bash
ls -l "$(brew --prefix espeak-ng)/lib/libespeak-ng.dylib"
```

If you see this error:

```text
RuntimeError: Calculated padded input size per channel...
Kernel size can't be greater than actual input size
```

you likely passed `--text -`, and Coqui synthesized a literal `-` (too short for the default model). Use `--text "Hello world"` instead.

## 6. Configure stash to use Coqui

We'll need to update the Coqui provider to find the pyenv Python:
- Update path in `/packages/core/src/lib/tts/providers/coqui.ts` to use pyenv's tts
- Or create a wrapper script that activates the environment

## Benefits over gTTS

- **Offline**: No internet required after model download
- **Quality**: VITS models sound more natural
- **Privacy**: Audio processed locally
- **Speed**: Faster for repeated use (no network latency)
