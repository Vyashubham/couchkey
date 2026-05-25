# Xbox Remote Control — Demo v0.1

Control your Xbox Series X|S or Xbox One from your laptop's keyboard over WiFi.
No extra hardware needed — just your laptop and Xbox on the same network.

## What it does

- **D-pad navigation** via arrow keys
- **A/B/X/Y buttons** via Enter/Backspace/X/Y keys
- **Xbox Guide / View / Menu** via Escape/Tab/M
- **Macros** — one keystroke for multi-step actions (open search, take screenshot, etc.)
- **Media controls** — play/pause/skip from the GUI
- **Auto-discovery** — finds your Xbox on the network automatically
- **Real-time feedback** — buttons light up as you press them

## Prerequisites

1. **Node.js >= 12** installed on your laptop
2. Your **Xbox and laptop on the same WiFi network**
3. On your Xbox, enable remote connections:
   - Go to **Settings → Devices & connections → Remote features**
   - Turn ON "Enable remote features"  
   - Under "Xbox app preferences", select **"Allow connections from any device"**

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in your browser
# → http://localhost:3247
```

## How to Use

1. Open `http://localhost:3247` in your browser
2. Click **Scan** to auto-discover your Xbox, or type its IP address
3. Click the discovered Xbox (or click **Connect**)
4. Press **Ctrl+Shift+K** to capture your keyboard — now your keystrokes go to the Xbox
5. Use arrow keys, Enter, Backspace, etc. to navigate
6. Press **Ctrl+Shift+K** again to release the keyboard back to normal

## Keyboard Shortcuts (when captured)

| Key           | Xbox Action        |
|---------------|--------------------|
| Arrow keys    | D-pad              |
| Enter         | A (select)         |
| Backspace     | B (back)           |
| Escape        | Xbox Guide button  |
| Tab           | View button        |
| M             | Menu button        |
| X             | X button           |
| Y             | Y button           |
| Space         | Play/Pause media   |
| Ctrl+G        | Open Guide         |
| Ctrl+H        | Go Home            |
| Ctrl+F        | Open Search        |
| Ctrl+S        | Screenshot         |
| Ctrl+R        | Record last clip   |
| Ctrl+P        | Parties & Chats    |
| Ctrl+Q        | Quick Settings     |

## Technical Details

- Uses the **SmartGlass protocol** (UDP port 5050) — the same protocol the Xbox mobile app uses
- **Anonymous connection** — no Microsoft account login needed
- Latency: ~1-5ms over LAN (near-instant)
- Node.js backend connects to Xbox, serves web GUI, bridges input via WebSocket

## Troubleshooting

**"No consoles found"**
- Is your Xbox powered on (not in standby)?
- Are both devices on the same WiFi network/subnet?
- Try entering the Xbox's IP directly (Settings → General → Network settings)

**"No anonymous connections"**
- Go to Xbox Settings → Devices & connections → Remote features
- Set "Xbox app preferences" to "Allow connections from any device"

**"SmartGlass is disabled"**
- Enable Remote features in Xbox Settings → Devices & connections

**Connection drops frequently**
- Check WiFi signal strength on both devices
- The app auto-reconnects after 3 seconds
