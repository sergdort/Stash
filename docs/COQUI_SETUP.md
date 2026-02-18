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

## 4. Test Coqui

```bash
# List available models
tts --list_models

# Test with default model
echo "Hello world" | tts --text - --out_path test.wav

# Test with high quality model
echo "Hello world" | tts --model_name tts_models/en/ljspeech/vits --text - --out_path test.wav
```

## 5. Configure stash to use Coqui

We'll need to update the Coqui provider to find the pyenv Python:
- Update path in `/packages/core/src/lib/tts/providers/coqui.ts` to use pyenv's tts
- Or create a wrapper script that activates the environment

## Benefits over gTTS

- **Offline**: No internet required after model download
- **Quality**: VITS models sound more natural
- **Privacy**: Audio processed locally
- **Speed**: Faster for repeated use (no network latency)
