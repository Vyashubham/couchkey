# Prior Art and Latency for a Network/BLE-Controlled USB HID Keyboard+Mouse Bridge ("Couchkey")

Research date: 2026-11-14. GitHub stats (stars, `pushed_at`, created, license) were pulled from the GitHub API on that date. All "Measured" numbers come from a cited test; "Estimate" marks reasoning or vendor/spec limits.

## Q1. Prior-art projects: what they do, hardware, transport, protocol, license, maturity, console/Xbox testing

### Takeaway
Small, mostly 2025–2026 hobby projects already do "Wi-Fi or BLE in, USB HID keyboard+mouse out". The ESP32-S3 with native USB (TinyUSB) is the dominant hardware, with the Pico W / Pico 2 W second. The most mature design to borrow from is PiKVM's Pico HID serial protocol (GPL-3.0, 306 stars on kvmd). The closest match to Couchkey's shape is KMChris/esp32-kvm-ip (MIT, UDP full-state packets). No project I could verify has documented testing on an Xbox Series X|S. A few mention "consoles" only generically.

### Cited Findings

**ESP32-S3 Wi-Fi to USB HID**
- **KMChris/esp32-kvm-ip.** A Windows host captures keyboard and mouse and sends them over Wi-Fi UDP (port 4210) to an ESP32-S3 (e.g. DevKitC-1), which appears to the target as a USB keyboard+mouse through native USB OTG.
  - Packets are fixed 16-byte little-endian with an event-type header. Each carries the full button/key state rather than deltas, and a sequence counter lets the ESP32 drop duplicate or stale packets.
  - Mouse is relative (16-bit dX/dY), with 5 buttons and vertical and horizontal wheel.
  - No authentication on the UDP channel. MIT license, 36 stars, 9 commits. Consoles not mentioned. — [GitHub README](https://github.com/KMChris/esp32-kvm-ip)
  - GitHub API: created 2026-03-11, last push 2026-07-07, MIT. — [GitHub](https://github.com/KMChris/esp32-kvm-ip)
- **ferrets6/ESP32-S3-wifi-kvm.** ESP32-S3 Super Mini firmware (TinyUSB) controlled from a web page over a WebSocket at `/ws`, with HTTP for the control panel, OTA updates and Wi-Fi setup.
  - The raw HID text protocol sends one frame per event: `hr:<mod>:<usage>:<1|0>` (full modifier byte, HID usage, down/up).
  - All keys are released when any WebSocket client disconnects. Repeated key-downs are ignored, and the 6-key rollover limit applies.
  - No auth ("trusted home network only"). Has a `kbonly` boot-keyboard build for BIOS. MIT license, 0 stars. Created 2026-09-17, last push 2026-09-23. — [GitHub](https://github.com/ferrets6/ESP32-S3-wifi-kvm)
- **x1watt/ditto.** ESP32-S3 USB keyboard+mouse (plus planned mass storage and HDMI capture via TC358743) with a token-authenticated HTTP/JSON API: `/type`, `/key`, `/mouse` (relative dx/dy) and others.
  - The bearer token is generated on first boot. The WebSocket `/stream` carries JPEG frames and authenticates with `?token=`.
  - No license, 0 stars, a single commit (2026-10-18). — [GitHub](https://github.com/x1watt/ditto)
- **z94snq/s3-pikvm-hid.** ESP32-S3 firmware that emulates PiKVM's Pico HID over a USB-UART bridge (CP2102/CH343), so kvmd's `serial` HID plugin works unchanged.
  - Supports absolute (default) and relative mouse modes.
  - GPL-3.0 because it ports kvmd code. 0 stars, created 2026-10-04. Tested only on Freenove ESP32-S3-WROOM + Pi 5. — [GitHub](https://github.com/z94snq/s3-pikvm-hid)

**BLE to USB HID**
- **larrylart/blue_keyboard.** An ESP32-S3 dongle (reference: LilyGO T-Dongle S3) that takes text and passwords from Android/iOS apps over BLE and types them as USB HID. Integrates with KeePassDX and KeePassium.
  - Security combines BLE bonding with application-level mTLS and "AppKey" onboarding.
  - Claims to work with "any computer or console", but has no Xbox-specific claim.
  - MIT license, 43 stars, 86 commits, release v2.1.0. Created 2025-09-28, last push 2026-01-23. — [GitHub](https://github.com/larrylart/blue_keyboard)
- **shiomachisoft/picow_ble_usb_hid_bridge.** Pico W / Pico 2 W firmware written in C on the Pico SDK with BTstack. It acts as a BLE Central for one BLE keyboard or mouse and re-exposes it as USB HID.
  - Core 0 runs USB and core 1 runs BTstack. The USB endpoint is polled every 1 ms.
  - The HID report descriptor is passed through unchanged and reports are forwarded byte for byte.
  - Supports RPA/IRK reconnection. After encryption it requests a 12.5–15 ms connection interval "so a power-saving default on the peripheral does not turn into input lag".
  - 20 stars, created 2026-01-04, last push 2026-09-11. License in LICENSE.TXT (GitHub reports NOASSERTION). — [README](https://github.com/shiomachisoft/picow_ble_usb_hid_bridge)
  - Its sibling, **pico_usb_ble_hid_bridge**, goes the other way (USB keyboard/mouse/gamepad to BLE HID). 5 stars, last push 2026-09-14. — [GitHub](https://github.com/shiomachisoft/pico_usb_ble_hid_bridge)
- **Adafruit "Pico Bluetooth Keyboard Bridge".** A Learn Guide (about Aug 2025, inferred from image timestamps) where a Pico W / Pico 2 W connects to a Bluetooth keyboard and acts as a USB HID keyboard. Tested with a Classic keyboard (Keychron K8) and a BLE keyboard (8BitDo). No latency or console notes. — [Adafruit Learn](https://learn.adafruit.com/pico-bluetooth-keyboard-bridge/overview)
- **quaxalber/bluetooth_2_usb.** Raspberry Pi (Zero W/2 W, 4B, 5) with BlueZ and Linux USB gadget mode. Bluetooth keyboards and mice appear to the target as wired USB HID.
  - Lists "consoles" as a use case, without model-specific compatibility.
  - Pairing is through `bluetoothctl`. A toggle shortcut (default Ctrl+Shift+F12) turns relaying on and off. No stuck-key handling is described.
  - MIT license, 93 stars, 139 commits. Created 2023-09, last push 2026-05-17. — [GitHub](https://github.com/quaxalber/bluetooth_2_usb)
- **Similar BLE-to-USB bridges:** finger563/esp-usb-ble-hid (ESP32-S3, MIT, 28 stars, last push 2026-11-08) and timothyb89/bt2usb (Pico W, 10 stars). — [esp-usb-ble-hid](https://github.com/finger563/esp-usb-ble-hid); [bt2usb](https://gh.r-mj.com/timothyb89/bt2usb)

**PiKVM Pico HID and its serial protocol (most mature reference)**
- The Pico HID uses an original RP2040 Pico (not the Pico 2) and emulates a USB keyboard plus an absolute or relative mouse, with optional PS/2. It connects to the Pi over SPI (V2/V3) or UART (with GP22 tied to GND). — [PiKVM docs](https://docs.pikvm.org/pico_hid/)
- **Protocol** (kvmd source, `kvmd/plugins/hid/_mcu/proto.py` and `hid/arduino/src/proto.h`):
  - Every request is exactly 8 bytes: `0x33` magic, a 5-byte command, then a big-endian CRC16 (polynomial 0xA001, init 0xFFFF).
  - Commands: `0x01` PING, `0x02` REPEAT, `0x03` SET_KEYBOARD, `0x04` SET_MOUSE, `0x05` SET_CONNECTED, `0x10` CLEAR_HID (release everything), `0x11` KEY (code, state), `0x12` MOUSE MOVE absolute (int16 x, y), `0x13` BUTTON, `0x14` WHEEL, `0x15` RELATIVE (int8 dx, dy).
  - Responses are 4 or 8 bytes with magic `0x34` and codes NONE `0x24`, CRC_ERROR `0x40`, INVALID `0x45`, TIMEOUT `0x48`. The PONG response carries Caps/Num/Scroll LED state plus keyboard/mouse-offline flags.
  - kvmd retries up to 5 times with a 0.5 s delay. Keys are sent as key-down/up events, not as reports.
  - — [kvmd proto.py](https://github.com/pikvm/kvmd/blob/master/kvmd/plugins/hid/_mcu/proto.py); [kvmd proto.h](https://github.com/pikvm/kvmd/blob/master/hid/arduino/src/proto.h)
- The Pico UART speed is 115200 baud (`_SPEED 115200` in `hid/pico/src/ph_com_uart.c`). — [kvmd source](https://github.com/pikvm/kvmd/tree/master/hid/pico/src)
- kvmd is GPL-3.0, has 306 stars and was last pushed 2026-11-14 (actively maintained). — [GitHub](https://github.com/pikvm/kvmd)

**KVM-over-IP products that inject HID**
- **TinyPilot** (MIT, 3,491 stars, last push 2026-08-17) appears to the target as a USB hub with HID keyboard, HID mouse and a drive, and uses absolute mouse positioning.
  - Absolute positioning causes trouble on some targets: ChromeOS treated the absolute mouse as touch, and one downstream KVM made the cursor move erratically. — [TinyPilot forum](https://forum.tinypilotkvm.com/-130/mouse-hid-gets-interpreted-as-touch-on-chromebook); [TinyPilot forum](https://forum.tinypilotkvm.com/-396)
- **Sipeed NanoKVM** (GPL-3.0, 6,610 stars, last push 2026-11-12) exposes Linux HID gadgets `/dev/hidg0–2`. NanoKVM-USB supports both absolute and relative mouse modes. One review reported HID glitches that needed a reboot. — [awesome.ecosyste.ms nanokvm-hid](https://awesome.ecosyste.ms/projects/github.com%2Fmessense%2Fnanokvm-hid); [NanoKVM-USB](https://github.com/sipeed/NanoKVM-USB); [StorageReview](https://www.storagereview.com/review/sipeed-nanokvm-usb-review-bridging-the-gap-between-host-and-target-machines)
- I found no measured HID input-latency numbers for TinyPilot or NanoKVM. Forum posts complain of lag without numbers. NanoKVM-Go's "60 ms" figure is video latency, not HID. — [TinyPilot forum](https://forum.tinypilotkvm.com/-771/latency-mouse-issues); [It's FOSS](https://itsfoss.com/news/sipeeds-nanokvm-go-crowdfunding/)

**Console and Xbox evidence**
- No source I found confirms PiKVM, TinyPilot or any ESP32/Pico HID bridge working on an Xbox Series X|S. — search results summarized at [PiKVM docs](https://docs.pikvm.org/pico_hid/), [TinyPilot forum](https://forum.tinypilotkvm.com/-13/videogame-console-controller-usb-passthrough)
- Commercial gaming adapters such as the IOGEAR KeyMander Nexus list Xbox One and Series X|S support. These emulate a controller rather than relying on native keyboard/mouse support. — [Engadget](https://www.engadget.com/iogear-keymander-nexus-gaming-kvm-xbox-switch-ps4-keyboard-mouse-160016494.html); [B&H](https://www.bhphotovideo.com/c/product/1736932-REG/iogear_gcs1337_keymander_nexus_3_port_gaming.html)
- Xbox Series X|S accepts plug-and-play USB keyboards and mice. The keyboard can navigate the home screen, but in-game support is per title (Fortnite, Sea of Thieves, CoD, Minecraft, Age of Empires, Flight Simulator and others).
  - Sources conflict on wireless: one says wireless keyboards with USB dongles work, another says wired only and no Bluetooth.
  - These are secondary press guides. The official support.xbox.com page could not be fetched.
  - — [SlashGear](https://www.slashgear.com/1177672/how-to-use-a-keyboard-and-mouse-on-the-xbox-series-x); [VideoGamer](https://www.videogamer.com/tech/peipheral/what-xbox-series-xs-games-support-keyboard-and-mouse); [Pure Xbox list](https://www.purexbox.com/guides/all-xbox-games-with-mouse-and-keyboard-support)
- An ESP32-S3 TinyUSB mouse scroll-wheel issue has been reported when the host expects a different report layout. — [esp32.com](https://esp32.com/viewtopic.php?p=143351)

### Inferences
- For Couchkey's firmware, the best fit is an ESP32-S3 with TinyUSB composite HID (boot keyboard plus relative mouse with wheel). It is proven by four independent 2026 projects and gives Wi-Fi and BLE on one chip. The Pico 2 W is the alternative if BTstack/BLE is the main transport.
- A relative mouse is the safer choice for the Xbox. Consoles and games expect a normal mouse, and absolute-pointer HID has caused problems on non-PC targets (ChromeOS treated it as touch).
- The PiKVM 8-byte CRC'd command set (KEY down/up, REL move, BUTTON, WHEEL, CLEAR_HID, PING with LED status) is a good template for the semantics. Copying its code would pull in GPL-3.0, so re-implementing the idea is the MIT-friendly route.
- Couchkey would likely be the first open project to publicly document Xbox Series X|S keyboard+mouse behavior from a microcontroller bridge. Plan an early hardware smoke test: dashboard navigation, the Edge browser, and a keyboard/mouse-enabled title.

### Gaps
- No primary Microsoft documentation was retrieved on which HID descriptors (boot vs report protocol, composite devices, hubs) the Xbox Series accepts. support.xbox.com returned an empty page.
- Last-commit dates in the stats list are from the GitHub API `pushed_at` field. Commit counts are from READMEs.
- Couldn't verify a Synergy/Barrier/Input Leap/Deskflow "hardware bridge" project. No search was dedicated to it within the call budget. Known software KVMs (Deskflow and its forks) need a client OS on the target, so they don't work on Xbox without a hardware bridge.
- No measured latency figures were found for any of the listed HID bridge projects.

## Q2. How these projects capture input, encode events, handle stuck keys, and authenticate

### Takeaway
Desktop hosts use OS hooks (WinAPI low-level hooks plus Raw Input). Web hosts use WebSocket text frames. Encoding splits between full-state snapshots (KMChris, robust to UDP loss) and per-key down/up events (PiKVM, ferrets6). Stuck-key handling, where it exists at all, is either "full state in every packet" or "release all on disconnect" (ferrets6, PiKVM CLEAR_HID). Authentication ranges from none (most) to a bearer token (ditto) to BLE bonding plus mTLS (blue_keyboard).

### Cited Findings
- **Capture via OS hooks.** KMChris captures on Windows with a Python server using `WH_KEYBOARD_LL`/`WH_MOUSE_LL` hooks plus Raw Input (`WM_INPUT`) for 1:1 sensor deltas without Windows acceleration. The send rate is fixed at 125 Hz by default (configurable 60–1000 Hz). — [KMChris README](https://github.com/KMChris/esp32-kvm-ip)
- **Full-state encoding.** In KMChris, every UDP packet carries the full key/button state, so a lost packet can't leave a key stuck. A sequence number discards stale or out-of-order packets. — [KMChris README](https://github.com/KMChris/esp32-kvm-ip)
- **Event encoding with release-on-disconnect.** ferrets6 sends `hr:<mod>:<usage>:<1|0>` per event and releases all keys when any WebSocket client disconnects. — [ferrets6 README](https://github.com/ferrets6/ESP32-S3-wifi-kvm)
- **Event encoding with a protocol-level reset.** PiKVM sends KEY with code and state, plus mouse BUTTON, MOVE (absolute int16), RELATIVE (int8) and WHEEL. It has an explicit `CLEAR_HID` (0x10) command to release everything, and PING/PONG reports LED state and whether keyboard/mouse are online. — [kvmd proto.py](https://github.com/pikvm/kvmd/blob/master/kvmd/plugins/hid/_mcu/proto.py)
- **Report pass-through.** shiomachisoft forwards raw HID reports byte for byte and passes the BLE device's report descriptor through, re-enumerating USB once BLE is up. — [README](https://github.com/shiomachisoft/picow_ble_usb_hid_bridge)
- **REST-style events.** ditto uses JSON `/key`, `/type` and `/mouse` (dx/dy) with a bearer token, and warns to treat the token "as a root credential" and not to port-forward. — [ditto](https://github.com/x1watt/ditto)
- **Strongest auth.** blue_keyboard uses BLE bonding plus application-level mTLS and AppKey provisioning. — [blue_keyboard](https://github.com/larrylart/blue_keyboard)
- **Unauthenticated LAN.** KMChris documents no channel authentication. ferrets6 is explicitly unauthenticated. — [KMChris](https://github.com/KMChris/esp32-kvm-ip); [ferrets6](https://github.com/ferrets6/ESP32-S3-wifi-kvm)
- **Disabling the relay.** bluetooth_2_usb uses a hotkey (Ctrl+Shift+F12) to toggle relaying and an optional "grab" of local input. — [bluetooth_2_usb](https://github.com/quaxalber/bluetooth_2_usb)

### Inferences
- Couchkey should combine the two robustness techniques:
  - Send full-state keyboard snapshots (modifier byte plus up to 6 keycodes, which is the HID boot report) with a sequence number.
  - Accumulate mouse deltas per tick.
  - Add a firmware watchdog that releases all keys and buttons if nothing arrives from the client within N ms (e.g. 250–500 ms of no packets or heartbeats).
  - Also release on WebSocket close, BLE disconnect, page `blur`/`visibilitychange`, and pointer-lock exit.
- Firmware authentication: pair once with a shared secret (QR code or button-press pairing), then HMAC each UDP datagram or authenticate the WebSocket upgrade. The existing threat models (ditto, ferrets6) show a HID injector on the LAN is effectively root on the target.

### Gaps
- None of the projects documented a dedicated host-side "panic/release-all" key or measured stuck-key rates under packet loss.

## Q3. Latency: Wi-Fi UDP, WebSocket/TCP, ESP-NOW, BLE; USB polling; what is acceptable

### Takeaway
On an ESP32, a tuned Wi-Fi link to the microcontroller is about 6–15 ms one-way median (UDP ~9 ms, TCP ~6 ms, WebSocket ~14 ms, measured). Untuned defaults with power save are 40–245 ms. BLE is bounded by the connection interval: 7.5 ms minimum per spec, 15 ms on iOS (11.25 ms for HID accessories), with medians of 13–22 ms measured. USB full-speed HID polling adds ≤1 ms at bInterval=1. Realistic end-to-end is about 10–30 ms with good jitter control. That is fine for typing and cursor control and acceptable for casual gaming. Wi-Fi power save is the single biggest pitfall.

### Cited Findings
**Measured, Electric UI benchmark** (one-way latency, trigger pin to receive pin, 12-byte payload, bench conditions; published around Feb 2024)
- ESP32 Wi-Fi UDP, raw sockets: ~9 ms median after tuning (modem power-save changes, Wi-Fi/LwIP in IRAM). Default config gave 74–84 ms medians. — [Electric UI](https://electricui.com/blog/latency-comparison)
- ESP32 Wi-Fi TCP: ~6 ms median, tuned, with Nagle disabled. — [Electric UI](https://electricui.com/blog/latency-comparison)
- ESP32 WebSocket: ~14.4 ms median after setting TCP_NODELAY. Before that, results spread from ~30 to 245 ms. — [Electric UI](https://electricui.com/blog/latency-comparison)
- ESP-NOW: ~5.6 ms median (around 5 ms typical). — [Electric UI](https://electricui.com/blog/latency-comparison)
- BLE:
  - ESP32 Bluedroid: ~14.6 ms (notify) and ~20 ms (write).
  - ESP32 NimBLE: ~22 ms after connection-parameter and DLE fixes (45/28 ms before).
  - nRF52840 Zephyr NUS: ~13.4 ms.
  - Results cluster in steps of about 7 ms, matching the 7.5 ms connection interval.
  - — [Electric UI](https://electricui.com/blog/latency-comparison)
- Bluetooth Classic SPP on ESP32: ~12.9 ms. nRF24: ~0.3 ms. — [Electric UI](https://electricui.com/blog/latency-comparison)
- Hackaday's summary of the same benchmark says ESP32 WebSockets were about 10x slower than plain TCP before tuning. — [Hackaday](https://hackaday.com/2024/02/11/benchmarking-latency-across-common-wireless-links-for-mcus/); raw data at [GitHub](https://github.com/Scottapotamas/embedded-wireless-latency-eval/)

**Measured, forums and anecdotes**
- ESP32 UDP round-trip time varied from 40 to 200 ms between two ESP32-WROVERs. An Espressif responder blamed Wi-Fi power save and recommended disabling it or keeping traffic under about 50 ms gaps. — [esp32.com](https://esp32.com/viewtopic.php?p=47850)
- An ESP32-C5 audio bridge with power save off measured raw `sendto`→`recvfrom` of about 540 ± 200 µs, with rare outliers. — [esp32.com](https://esp32.com/viewtopic.php?p=143943)
- A 2019 ESP32 report described Wi-Fi jitter of 4–90 ms even with power management disabled. It is old, so weight it lightly. — [time-nuts](https://febo.com/pipermail/time-nuts_lists.febo.com/2019-December/098495.html)
- ESP-NOW round-trip time:
  - 689 µs after disabling AMPDU. — [esp32.com](https://esp32.com/viewtopic.php?p=151325)
  - About 6 ms minimum with 250-byte payloads. — [esp32.com](https://esp32.com/viewtopic.php?p=43423)
  - Under 1 ms for about 95% of packets, with a 6 ms worst case (Hackaday reader comment, unverified). — [Hackaday](https://hackaday.com/2024/02/11/benchmarking-latency-across-common-wireless-links-for-mcus/)
- KMChris reports that disabling Wi-Fi modem sleep removes about 200 ms of first-packet lag. Its USB polling interval is 1 ms. — [KMChris](https://github.com/KMChris/esp32-kvm-ip)
- Espressif documents power-save modes (`esp_wifi_set_ps(WIFI_PS_NONE)` vs `MIN_MODEM`) in its Wi-Fi performance guide. — [ESP-IDF docs](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/wifi-driver/wifi-performance-and-power-save.html); [esp32.com](https://esp32.com/viewtopic.php?p=118729)

**BLE connection-interval limits (spec and vendor)**
- Android accepts connection intervals down to 7.5 ms, the spec minimum before Bluetooth 6.2. — [Punch Through](https://punchthrough.com/maximizing-ble-throughput-on-ios-and-android/)
- Android's `CONNECTION_PRIORITY_HIGH` is reported at about 11.25–15 ms. This comes from a secondary source, not primary Android docs. — [Punch Through](https://punchthrough.com/maximizing-ble-throughput-on-ios-and-android/)
- Apple requires Interval Min ≥ 15 ms and a multiple of 15 ms. If the accessory exposes BLE HID, intervals down to 11.25 ms may be accepted. — [Silicon Labs on Apple guidelines](https://docs.silabs.com/bluetooth/3.3/bluetooth-miscellaneous-mobile/selecting-suitable-connection-parameters-for-apple-devices); [Apple QA1931](https://developer.apple.com/library/archive/qa/qa1931/_index.html)
- One source says the Apple guidelines document mentions a 20 ms minimum, "but this is not seen in practice". — [Nordic DevZone](https://devzone.nordicsemi.com/f/nordic-q-a/106337/adhering-to-apple-accessory-design-guidelines-for-ble-connection-intervals)
- Setting min = max = 15 ms caused disconnects on iOS 16, which were fixed by allowing a 30 ms max. — [Apple forums](https://developer.apple.com/forums/thread/717451)
- shiomachisoft requests 12.5–15 ms once the link is encrypted, to avoid peripheral power-saving defaults turning into input lag. — [README](https://github.com/shiomachisoft/picow_ble_usb_hid_bridge)

**USB side**
- Bridge projects poll the USB HID endpoint at 1 ms (KMChris, shiomachisoft). — [KMChris](https://github.com/KMChris/esp32-kvm-ip); [shiomachisoft](https://github.com/shiomachisoft/picow_ble_usb_hid_bridge)
- The PiKVM UART link runs at 115200 baud with 8-byte frames. — [kvmd source](https://github.com/pikvm/kvmd/tree/master/hid/pico/src)
- **Estimate:** at 115200 baud (8N1, 10 bits per byte) an 8-byte frame takes about 0.7 ms, which is negligible.

### Inferences (estimates, not measurements)
- **Budget for Wi-Fi UDP, tuned:**
  - Host capture and send: <1 ms.
  - Wi-Fi to ESP32: ~1–9 ms median. The Electric UI ~9 ms includes their stack overhead. Bare `sendto`→`recvfrom` can be sub-ms. Jitter tails reach tens of ms on a busy home AP.
  - Firmware: <1 ms.
  - USB poll at bInterval=1: 0–1 ms.
  - **Total: about 3–12 ms median, with tails of 20–50+ ms.**
- **WebSocket:** adds about 5 ms median versus raw TCP when TCP_NODELAY is set, and is much worse without it. With a browser client, the browser and OS stack add more again.
- **BLE:** median roughly 1–1.5 connection intervals: ~10–20 ms on Android or a PC at 7.5–15 ms, and ~15–25 ms on iOS.
- **Acceptability** (heuristic; no primary human-factors source was retrieved this pass):
  - Typing tolerates 50–100 ms easily.
  - Cursor or pointer control feels "direct" below about 20–30 ms and becomes noticeably laggy above about 50 ms.
  - Casual gaming is OK below about 30–40 ms if jitter is low. Competitive FPS players notice even 10 ms.
  - Jitter matters as much as the median, so coalescing mouse deltas at a fixed tick (e.g. 125–250 Hz like KMChris) smooths it.
- **Recommended transport and protocol design for Couchkey:**
  1. Primary transport: Wi-Fi UDP from the Node hub to the ESP32-S3. Use `WIFI_PS_NONE`, a 125–250 Hz send tick plus immediate send on key changes, and 16–24 byte packets: magic, version, seq, flags, keyboard boot report (mod + 6 keys), mouse dx/dy int16, wheel, buttons, then an HMAC-SHA256 truncated tag. Full state in every packet; deltas accumulate per tick.
  2. Browser pages go through the existing Node hub over WebSocket with TCP_NODELAY (browsers cannot send UDP). The hub converts to UDP. Alternatively the ESP32 can serve WebSocket directly, at the cost of about 5–15 ms extra.
  3. Heartbeat every 50–100 ms when idle. This also keeps the radio awake and avoids power-save latency. A firmware watchdog sends an all-released report after about 300 ms of silence.
  4. Optional BLE GATT transport, either as a phone fallback or for setup and pairing: one write-without-response characteristic carrying the same packet format, with a 7.5–15 ms connection interval requested.
  5. Keep ESP-NOW only as a niche option. It needs a second ESP32 dongle on the laptop and offers no real latency win over tuned UDP for this use case.
  6. Mouse: relative only (HID boot-compatible report with wheel). Keyboard: boot protocol 6KRO, for maximum console compatibility.

### Gaps
- No end-to-end measurement of the full chain (laptop/browser → home router → ESP32-S3 → USB HID → console) was found for any project. Couchkey should instrument this itself, for example with a UDP echo RTT test plus a photodiode or high-speed camera on the Xbox.
- No primary source was retrieved for the USB 2.0 full-speed interrupt `bInterval` range (1–255 ms) or the Xbox's actual polling rate for HID devices.
- No primary human-factors source for latency thresholds was retrieved. The thresholds above are heuristics.
- No Android primary doc was retrieved for the exact `CONNECTION_PRIORITY_HIGH` interval.

## Q4. Browser-based capture vs desktop app

### Takeaway
A web page can capture relative mouse motion through the Pointer Lock API (`movementX/Y`, with optional `unadjustedMovement` raw input), and most keys through `keydown`/`keyup` with `KeyboardEvent.code`. Esc, Ctrl/Cmd+W/T/N, Alt+Tab and the like need the Keyboard Lock API, which is Chromium-only, fullscreen-only and HTTPS-only. Some OS shortcuts can never be captured. Full capture (Cmd+Tab, Win key, Ctrl+Alt+Del-style keys, background capture) needs a desktop app with OS hooks, as KMChris does with WinAPI low-level hooks.

### Cited Findings
- Pointer Lock gives `movementX/Y` deltas with no bound while locked, while `clientX/Y` stay frozen. `requestPointerLock({unadjustedMovement: true})` disables OS acceleration where supported, rejects with `NotSupportedError` on some platforms, and needs a fallback.
- Locking requires a user engagement gesture, for example calling it from a click handler. A new gesture is needed after the user exits with the default unlock gesture. Pressing Esc exits pointer lock, firing `pointerlockchange`.
- The API is marked "Limited availability" on MDN.
- — [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)
- Keyboard Lock (`navigator.keyboard.lock([...codes])`) captures keys normally handled by the browser or OS, such as Escape, Alt+Tab and Ctrl+N, by physical `code`, under any modifier combination. MDN marks it experimental and intended for fullscreen games and remote-access apps. — [MDN Keyboard API](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard_API)
- Chrome does not let content override Ctrl+T, Ctrl+W or Ctrl+N with `preventDefault()`, and reportedly does not even dispatch them to pages. The Chromium "browser keys" design notes call these the most problematic accelerators. — [Mozilla bug 1203059](https://bugzilla.mozilla.org/show_bug.cgi?id=1203059); [Chromium design doc](https://www.chromium.org/developers/design-documents/extensions/proposed-changes/apis-under-development/browser-keys/)
- A Chromium intent ("Browser Shortcuts in Fullscreen") would let fullscreen sites preventDefault browser shortcuts like Ctrl+T. A Chrome engineer said Edge already did this. Shipping status was not confirmed. — [blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/wlRDnLbyVlk)
- Firefox's test suite expects Ctrl+N and Ctrl+T to reach content under keyboard lock. — [Searchfox test](https://searchfox.org/firefox-main/source/browser/base/content/test/fullscreen/browser_fullscreen_keyboard_lock_reserved.js); [Mozilla bug 1593883](https://bugzilla.mozilla.org/show_bug.cgi?id=1593883)
- Desktop capture example: KMChris uses `WH_KEYBOARD_LL`/`WH_MOUSE_LL` hooks plus Raw Input to grab everything on Windows, including keys a browser can't see. — [KMChris](https://github.com/KMChris/esp32-kvm-ip)

### Inferences
- **Browser mode, the default and "good enough" path:**
  - Fullscreen, then Keyboard Lock (Chromium), then Pointer Lock with `unadjustedMovement`.
  - Map `KeyboardEvent.code` to HID usage IDs and send down/up events or snapshots to the hub.
  - On `blur`, `visibilitychange` or `pointerlockchange`→unlocked, send release-all.
  - Without fullscreen and Keyboard Lock, Esc exits pointer lock and Ctrl+W/T/N go to the browser, so map a remote-Esc to an alternative chord.
  - Safari and Firefox lack Keyboard Lock (MDN's experimental flag; per-browser compatibility data was not fetched), so treat them as degraded.
  - iOS Safari has no pointer lock for touch, so a phone needs an on-screen trackpad sending relative deltas.
- **Desktop mode (Electron/Node in the existing hub):**
  - Electron's `globalShortcut` only registers specific accelerators. It can't swallow all input, so full capture needs a native hook module (WinAPI LL hooks on Windows, CGEventTap on macOS, which needs Accessibility/Input Monitoring permission) plus a "capture on/off" hotkey like bluetooth_2_usb's toggle.

### Gaps
- Exact current Chrome and Edge behavior for Ctrl+W/T/N under Keyboard Lock in fullscreen, and the long-press-Esc-to-exit rule, were not confirmed from a primary page in this pass. The MDN page fetched didn't state the fullscreen requirement or browser support table.
- Electron `globalShortcut` limitations and macOS CGEventTap permission requirements were not fetched. The inference above is from general knowledge.
