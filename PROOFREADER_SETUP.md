# Proofreader API Setup for MindStack

MindStack now includes a **Proofread Notes** feature powered by Chrome's built-in AI Proofreader API. This feature corrects grammar, spelling, and punctuation errors in your notes automatically.

## Requirements

The Proofreader API requires:

### Operating System
- Windows 10 or 11
- macOS 13+ (Ventura and onwards)
- Linux
- ChromeOS (Platform 16389.0.0+) on Chromebook Plus devices

### Hardware
- **Storage**: At least 22 GB of free space
- **GPU**: More than 4 GB of VRAM (if using GPU)
- **CPU**: 16 GB RAM + 4 CPU cores (if using CPU)
- **Network**: Unlimited data or unmetered connection for initial download

### Browser
- Chrome 141 to 145 (during origin trial)
- Latest version of Chrome recommended

## Setup Instructions

### For Development AND Production

**IMPORTANT**: Even with an origin trial token, you currently need to enable the Chrome flag. The origin trial alone is not sufficient.

1. **Enable the API in Chrome Flags** (REQUIRED)
   - Go to `chrome://flags/#proofreader-api-for-gemini-nano`
   - Select "Enabled"
   - Click "Relaunch" to restart Chrome

2. **Enable Optimization Guide** (REQUIRED)
   - Go to `chrome://flags/#optimization-guide-on-device-model`
   - Select "Enabled BypassPerfRequirement"
   - Click "Relaunch" to restart Chrome

3. **Verify Model Status**
   - Visit `chrome://on-device-internals`
   - Check the Proofreader API status and download progress
   - Wait for model to download (first time only)

4. **Install the Extension**
   - Load the extension in Chrome as usual
   - The Proofreader API will initialize automatically

### About Origin Trial Tokens

**This extension does NOT use origin trial tokens** =
- You should enable Chrome flags do use the proof reader api 

**Just enable the Chrome flags above** and you're done!

## Using the Proofread Feature

1. **Open a Solution**: Click on any saved solution in MindStack
2. **Edit Mode**: Click the "Edit Solution" button
3. **Add/Edit Notes**: Enter or modify your notes
4. **Proofread**: Click the "Proofread" button next to the Notes label
5. **Review**: The corrected text will replace your notes automatically
6. **Save**: Click "Save Changes" to persist the corrected notes


## Troubleshooting

### "Proofreader not available" Error

1. Check Chrome version (must be 141-145)
2. Verify flags are enabled (`chrome://flags/#proofreader-api-for-gemini-nano`)
3. Check available storage space (need 22+ GB)
4. Visit `chrome://on-device-internals` to verify model download status

### Model Not Downloading

1. Ensure you have an unmetered internet connection
2. Check available disk space
3. Restart Chrome
4. Wait for automatic download (may take time)

### No Corrections Detected

If you see "No corrections needed!" it means:
- Your text has no grammar, spelling, or punctuation errors, OR
- The text is too short or doesn't contain correctable content

## API Documentation

For more details about the Proofreader API:
- [Chrome Proofreader API Documentation](https://developer.chrome.com/docs/ai/built-in-apis/proofreader)
- [Origin Trial Information](https://developer.chrome.com/origintrials/)
- [People + AI Guidebook](https://pair.withgoogle.com/guidebook) (Best Practices)

## Privacy

The Proofreader API runs **entirely on-device** using Chrome's built-in Gemini Nano model. Your notes are:
- ✅ Never sent to external servers
- ✅ Processed locally on your machine
- ✅ Private and secure
- ✅ Available offline

---

**Note**: The Proofreader API is currently in origin trial (Chrome 141-145). Features and availability may change as the API evolves.

