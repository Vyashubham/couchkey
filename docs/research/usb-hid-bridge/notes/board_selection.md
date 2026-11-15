# Board selection for a Wi-Fi/BLE to USB HID (keyboard+mouse) bridge for Xbox Series X|S

Research date: 2026-11-14. Prices come from the retailer pages or search snippets seen on that date unless marked otherwise. Stock and prices change often, so re-check before ordering.

## Candidates: USB device support, radios, memory, connector, price, availability, quality

### Takeaway
Any ESP32-S3 board meets the core need: native USB 1.1 Full-Speed device mode plus Wi-Fi and BLE 5 on one chip, with first-party TinyUSB/Arduino support. **Primary pick: Adafruit QT Py ESP32-S3 (8 MB flash, no PSRAM, #5426), $12.50, USB-C.** It is a US seller with good docs, and a published Wi-Fi-to-USB-keyboard project already runs on it. Adafruit showed it **out of stock** on 2026-11-14, so the practical first choice is whichever of these is in stock: QT Py ESP32-S3, Seeed XIAO ESP32S3 (~$7.50 MSRP, ~$16 from US resellers), or Waveshare ESP32-S3-Zero ($5.49–7.99). The LilyGO T-Dongle-S3 is the alternative with a built-in USB-A plug and needs no cable.

### Cited Findings
**Adafruit QT Py ESP32-S3 (PID 5426)**
- 8 MB flash, no PSRAM, 512 KB SRAM, USB Type-C, built-in native USB, Wi-Fi and BLE (no BT Classic). $12.50 each for 1–9 units. **Out of stock** on 2026-11-14, with a notify-me signup — [Adafruit product page](https://www.adafruit.com/product/5426)
- USBKWA (touchgadget) uses this exact board for a browser-over-Wi-Fi to USB HID keyboard bridge. It is built with Arduino-ESP32 2.0.5, WebSockets, ArduinoJson and WiFiManager. The earlier version ran on an ESP32-S2 Saola, which needed a separately wired USB connector — [touchgadget/usbkwa](https://github.com/touchgadget/usbkwa)

**Seeed Studio XIAO ESP32S3**
- Wi-Fi + BLE 5.0, 8 MB PSRAM and 8 MB flash (per US reseller listing title). Price $15.97 at a US reseller. UK about £7.30, JP ¥1,456. An Amazon 3-pack was tracked at $26.99 (3rd party, 2026-06-27) — [reach.dog/Rokland listing](https://reach.dog/shop/rokland/products/seeed-studio-xiao-esp32s3-2-4ghz-wifi-ble-5-0-8mb-psram-8mb-flash-dual-core); [The Pi Hut](https://thepihut.com/products/seeed-studio-xiao-esp32s3); [camelcamelcamel Amazon tracker](https://camelcamelcamel.com/product/B0C69FFVHH)
- Board overview — [atomic14 XIAO ESP32-S3 page](https://www.atomic14.com/esp32/boards/xiao-esp32-s3/)

**Waveshare ESP32-S3-Zero (SKU 25081)**
- $5.49–$7.99 depending on variant and headers. Base version: 4 MB flash / 2 MB PSRAM. N8R8 variant: 8 MB / 8 MB. USB Type-C, onboard ceramic antenna, ME6217C33M5G LDO (800 mA max). Download mode is BOOT then RESET. The page showed no stock count — [Waveshare product page](https://www.waveshare.com/esp32-s3-zero.htm)
- Community antenna-mod write-ups exist for this board, which suggests marginal antenna performance — [Elektor Labs: ESP32-S3-Zero antenna mod](https://www.elektormagazine.nl/labs/esp32-s3-zero-antenna-mod); [mischianti forum thread](https://mischianti.org/forums/topic/waveshare-esp32s3-zero-wifi-antenna/)

**LilyGO T-Dongle-S3 (USB-A plug)**
- ESP32-S3, Wi-Fi b/g/n + BLE 5, 16 MB flash, no PSRAM. 0.96" ST7735 160×80 LCD, APA102 LED, TF card slot, BOOT button, QWIIC. Plugs straight into a USB Type-A port. Input 4.8–5.5 V, 800 mA max — [LilyGO wiki](https://wiki.lilygo.cc/products/t-dongle-series/t-dongle-s3/)
- Arduino setup: USB Mode defaults to "Hardware CDC and JTAG". Any example that uses USB needs "USB-OTG (TinyUSB)". The wiki requires Arduino-ESP32 core ≥3.3.0. If upload fails, hold BOOT while plugging in — [LilyGO wiki](https://wiki.lilygo.cc/products/t-dongle-series/t-dongle-s3/)
- A Plus variant adds 8 MB OPI PSRAM, a PDM mic and an IR transmitter — [LilyGO wiki T-Dongle-S3-Plus](https://wiki.lilygo.cc/products/t-dongle-series/t-dongle-s3-plus/)
- Price is only available from an older article: $14.98 without display and $15.98 with display on AliExpress — [CNX Software](https://cnx-software.com/?p=105501)
- An ESP-IDF board support component exists (espp/t-dongle-s3) — [Espressif Component Registry](https://components.espressif.com/components/espp/t-dongle-s3); a Zephyr board port also exists — [Zephyr docs](https://nrfconnectdocs.nordicsemi.com/ncs/latest/zephyr/boards/lilygo/tdongle_s3/doc/index.html)

**Espressif ESP32-S3-DevKitC-1-N8R8**
- DigiKey UK: £11.23 with 709 in stock. DigiKey FI: 0 in stock at €12.86. No US price was retrieved — [DigiKey UK](https://www.digikey.co.uk/en/products/detail/espressif-systems/ESP32-S3-DEVKITC-1-N8R8/15295894); [DigiKey FI](https://www.digikey.fi/en/products/detail/espressif-systems/ESP32-S3-DEVKITC-1-N8R8/15295894)
- Official board page — [Espressif ESP32-S3-DevKitC-1](https://www.espressif.com/en/dev-board/esp32-s3-devkitc-1-en)

**ESP32-S3 Super Mini (generic clones)**
- Reported to share the C3 Super Mini's weak-antenna reputation, "and on the S3 it can be worse" — [espboards.dev ESP32-S3 Super Mini](https://espboards.dev/esp32/esp32-s3-super-mini/)
- A user with several S3 Super Minis reported poor Wi-Fi that the popular antenna mod didn't fix. They replaced the chip antenna with an external one — [r/esp32 thread (mirror)](https://reddit.zackpollard.pro/r/esp32/comments/1mrfr6v/esp32_s3_supermini_replacing_chip_antenna_with)
- On C3 Super Minis, people blame bad antenna layouts (copper under the ceramic antenna) and brownout resets from Wi-Fi TX peaks of up to ~500 mA on weak regulators or cables. Lowering TX power (e.g. 8.5 dBm) stabilised links — [Hackaday.io C3 Super Mini Wi-Fi fix](https://hackaday.io/project/205906-esp32-c3-super-mini-wifi-fix-3-methods-that-work); [Home Assistant community](https://community.home-assistant.io/t/esp32-c3-super-mini-wifi-connection-problem/785228?page=2); [Arduino forum ESP-NOW TX power](https://forum.arduino.cc/t/esp32-c3-super-mini-esp-now-instable-a-pleine-puissance-tx/1459456.md)

**Raspberry Pi Pico 2 W (RP2350 + Infineon CYW43439)**
- Launch price $7. 2.4 GHz 802.11n Wi-Fi and Bluetooth 5.2 — [Hackster](https://www.hackster.io/news/raspberry-pi-launches-the-radio-equipped-raspberry-pi-pico-2-w-for-just-7-4073d1130363); [Core Electronics](https://core-electronics.com.au/raspberry-pi-pico-2-w-wireless.html.plain.md)
- Adafruit's "Pico Bluetooth Keyboard Bridge" guide shows a Pico W / Pico 2 W receiving Bluetooth keyboards and bridging them to USB HID. bt2usb does the same for BLE HID to USB HID on Pico W / Pico 2 W — [Adafruit Learn](https://learn.adafruit.com/pico-bluetooth-keyboard-bridge/overview); [bt2usb](https://gh.r-mj.com/timothyb89/bt2usb)

**USB device capability by chip**
- In Espressif's USB device table, ESP32-S2 and ESP32-S3 support USB 1.1 Full-Speed device mode, and ESP32-P4 adds High-Speed — [Espressif esp-iot-solution TinyUSB guide](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_overview/tinyusb_guide.html)
- The ESP32-C3 has only a fixed USB-Serial/JTAG peripheral and no general USB device peripheral. Arduino USB device APIs need the S2/S3 — [Arduino-ESP32 USB API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/usb.html)

### Inferences
- **Recommended purchase order:**
  1. **Adafruit QT Py ESP32-S3 #5426, $12.50.** Fast US shipping from Adafruit (NY). It also comes up on DigiKey and other resellers, but stock wasn't checked there. Its board is already proven by a Wi-Fi-to-HID keyboard project, and it has strong Adafruit/CircuitPython docs. It is out of stock at Adafruit, so check DigiKey or Mouser, or pick option 2.
  2. **Seeed XIAO ESP32S3**, about $7–16. Widely stocked on Amazon US, Seeed's own store and DigiKey. It has 8 MB PSRAM, which helps if MSC or bigger buffers come later, and it has a U.FL connector for an external antenna.
  3. **LilyGO T-Dongle-S3**, about $15–16 per the older AliExpress listing. Choose it if a cable-free stick is wanted: it plugs directly into the Xbox USB-A port and the TF slot is handy for future MSC. Downsides: likely AliExpress-only shipping (1–3 weeks to AZ), weaker vendor docs, and its tiny PCB antenna sits right against the console.
- Avoid generic ESP32-S3 Super Mini clones for this project. They save a few dollars, but antenna and regulator quality varies, and a brownout or weak link is exactly the failure that would be hard to debug on an Xbox.
- The DevKitC-1 works fine, but it is large and has two USB-C/micro-USB ports (UART bridge plus native USB). Only the native "USB" port enumerates as HID, so it is easy to plug the wrong one into the Xbox. This is the brief's premise and was not verified in a fetched source.
- RP2040/RP2350 Pico W / Pico 2 W are viable and cheap ($7), but they use micro-USB and need a USB-A to micro-B cable. Wi-Fi + TinyUSB coexistence also has less documentation (see below).

### Gaps
- No current Amazon US price was retrieved for the ESP32-S3 Super Mini, the M5Stack AtomS3, or a US DigiKey/Mouser USD price for DevKitC-1 or QT Py.
- The M5Stack AtomS3 and nRF52840 boards (e.g. XIAO nRF52840, Adafruit Feather nRF52840) were not researched within the tool budget. nRF52840 has USB device + BLE but no Wi-Fi, so it only fits a BLE-only design.
- The T-Dongle-S3's current price and US availability are not confirmed. The only figure found is from an older CNX article.
- Seeed's XIAO ESP32S3 MSRP on seeedstudio.com was not fetched. The ~$7.49 figure is from memory; the ~$16 figure is from a US reseller.

## Firmware/library support for USB HID composite + Wi-Fi; flashing from macOS; OTA

### Takeaway
ESP32-S3 with Arduino-ESP32 (USB Mode = "USB-OTG (TinyUSB)") or ESP-IDF esp_tinyusb is the best-trodden path. Wi-Fi and TinyUSB HID run together in at least one published project, and no Wi-Fi-specific HID conflict turned up. Known pitfalls are CDC/DTR interactions, PSRAM DMA, and USB suspend. Pico W + TinyUSB + CYW43 works in principle, but one forum report of conflicts went unresolved.

### Cited Findings
- esp_tinyusb wraps TinyUSB for CDC-ACM, MSC, HID, MIDI, DFU and ECM/NCM/RNDIS, and supports composite devices. Its examples include a composite MSC + CDC device. For complex or custom descriptors, the page points to the raw espressif/tinyusb component — [Espressif TinyUSB guide](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_overview/tinyusb_guide.html)
- The ESP-IDF USB Device Stack docs for ESP32-S3 (v5.x/v6.0) list composite device support and HID/MSC examples — [ESP-IDF v6.0 USB Device Stack](https://docs.espressif.com/projects/esp-idf/en/v6.0/esp32s3/api-reference/peripherals/usb_device.html)
- Arduino-ESP32 USB device support covers HID, CDC, MSC, Firmware-MSC update, composite examples and `enableDFU()`. The USB events are start, stop, suspend and resume. It works only on chips with a USB peripheral (S2/S3) — [Arduino-ESP32 USB API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/usb.html)
- USBKWA runs Wi-Fi (WebSockets) and USB HID together on an ESP32-S3 under Arduino — [touchgadget/usbkwa](https://github.com/touchgadget/usbkwa)
- Known Arduino-ESP32 HID issues:
  - HID SendReport errors and repeated re-enumeration after running a while, more often when CDC is sending on a timer — [arduino-esp32 #6922](https://github.com/espressif/arduino-esp32/issues/6922)
  - HID and serial stalling on DTR toggles; CDC DTR/RTS drive reset and boot lines — [arduino-esp32 #9582](https://redirect.github.com/espressif/arduino-esp32/issues/9582)
  - v3.1 device not entering USB suspend when the host sleeps — [arduino-esp32 #10831](https://github.com/espressif/arduino-esp32/issues/10831)
- MicroPython reported HID packets placed in PSRAM sending as zeros. The fix forces USB IRQ mode when PSRAM is enabled — [MicroPython PR triage](https://notes.alelec.net/assets/mpy-triage/pair/141.html)
- Uploading a new sketch can be harder once a sketch with HID is running on native USB, because the board no longer shows the default CDC port. The usual workaround is BOOT-button download mode — [Arduino forum](https://forum.arduino.cc/t/uploaded-sketch-with-hid-h-difficult-to-upload-new-sketch/1168847/8); [LilyGO wiki BOOT instructions](https://wiki.lilygo.cc/products/t-dongle-series/t-dongle-s3/)
- CircuitPython's Web Workflow (Wi-Fi code editing) works on native-USB Wi-Fi boards like the ESP32-S2/S3 and needs CircuitPython ≥8.0.0. To avoid file corruption, USB mass storage must be disabled for Web Workflow writes — [Adafruit Web Workflow guide](https://learn.adafruit.com/getting-started-with-web-workflow-using-the-code-editor.md?view=all); [Adafruit CircuitPython ESP32 quick start](https://learn.adafruit.com/circuitpython-with-esp32-quick-start/overview)
- CircuitPython `usb_hid` exposes KEYBOARD, MOUSE and CONSUMER_CONTROL by default, and `usb_hid.enable()` selects the devices — [Adafruit: Customizing USB devices in CircuitPython](https://learn.adafruit.com/customizing-usb-devices-in-circuitpython/hid-devices)
- Pico W:
  - One Arduino-forum developer saw failures in one or both functions when running TinyUSB keyboard + Wi-Fi MQTT, and no resolution was posted — [Arduino forum](https://forum.arduino.cc/t/raspberry-pico-w-using-tinyusb-and-wifi-in-parallel/1078641)
  - CYW43 needs `cyw43_poll()` or a background/threadsafe arch, and Wi-Fi adds >220 KB flash and ~40 KB RAM in arduino-pico — [arduino-pico Wi-Fi docs](https://arduino-pico.readthedocs.io/en/latest/wifi.html)

### Inferences
- **Easiest stack on a Mac:** Arduino IDE 2 or PlatformIO with the Arduino-ESP32 3.x core. Set USB Mode to "USB-OTG (TinyUSB)" and use `USBHIDKeyboard`, `USBHIDMouse` and `USBHIDConsumerControl` on one `USB.begin()` to get a composite device.
- **Recommended firmware design:**
  - Disable USB CDC on boot to avoid the DTR/CDC stalls above.
  - Log over Wi-Fi/UDP instead of serial.
  - Use Arduino `ArduinoOTA` or `HTTPUpdate` (or ESP-IDF `esp_https_ota`) for Wi-Fi OTA, so the board never needs to leave the Xbox. This needs a dual-OTA partition scheme, and 8 MB+ flash is comfortable.
  - Keep HID report buffers in internal RAM, not PSRAM.
- The ESP32-S3 ROM bootloader (BOOT+plug) appears as a serial device on macOS without drivers. With the native-USB-only boards (QT Py, XIAO, S3-Zero, T-Dongle) there is no CP210x/CH340 driver step.
- CircuitPython is the fastest path to a prototype: drag-and-drop code.py plus adafruit_hid. Long-term robustness and OTA are better under Arduino/ESP-IDF.

### Gaps
- No source specifically benchmarks HID latency or jitter under heavy Wi-Fi traffic on the ESP32-S3.
- No confirmed working example of Pico SDK TinyUSB HID + CYW43 Wi-Fi on the Pico 2 W was found.
- macOS flashing specifics (esptool vs Arduino IDE port naming) were not fetched; that part comes from general knowledge.

## USB mass storage (MSC) alongside HID

### Takeaway
It is feasible on the ESP32-S3: TinyUSB supports HID+MSC composite and Arduino-ESP32 has MSC classes. Backing storage can be internal flash (a small FAT partition) or an SD card, and the T-Dongle-S3 has a TF slot. RP2040/RP2350 TinyUSB also supports MSC, but that was not verified here.

### Cited Findings
- esp_tinyusb supports HID and MSC classes and composite devices, with an MSC + CDC composite example — [Espressif TinyUSB guide](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_overview/tinyusb_guide.html)
- Arduino-ESP32 has a USB MSC page and a Firmware-MSC update example — [Arduino-ESP32 USB API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/usb.html)
- The third-party HIDForge Arduino library claims a combined keyboard + mouse + SD-card MSC composite on the ESP32-S3. It has not been vetted — [HIDForge](https://github.lionck.workers.dev/Meshwa428/HIDForge)
- Native USB on the ESP32-S3 is USB 1.1 Full-Speed only, so MSC throughput is capped at 12 Mbit/s raw — [Espressif TinyUSB guide](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_overview/tinyusb_guide.html)

### Inferences
- HID+MSC composite is supported in the stack, but whether the Xbox will mount a 12 Mbit/s MSC device, and for what purpose (media, not game storage), is a separate question. Game storage on Series X|S needs USB 3.1 drives, which an MCU cannot meet.
- For MSC, prefer boards with PSRAM and/or SD: XIAO ESP32S3 (8 MB PSRAM), T-Dongle-S3 (TF slot), or S3-Zero N8R8.

### Gaps
- It was not verified whether the Xbox accepts a composite HID+MSC device, or whether MSC breaks HID enumeration on the console.
- No RP2040/RP2350 HID+MSC composite source was fetched.

## Power from the Xbox USB port and sleep behavior

### Takeaway
An ESP32-S3 board's Wi-Fi TX peaks (~300–500 mA) sit within a USB 3.x port's budget, which is commonly cited as 900 mA. No official Microsoft figure was found. USB power stays on when the console is "off" only in **Sleep/Instant-on** mode. In the default **Shutdown (energy-saving)** mode the USB ports lose power, so the bridge can't wake the console and will reboot on each power-on.

### Cited Findings
- Xbox Series X USB 3.1 Gen 1 ports "usually top out at 900mA (4.5W)". This is a consumer-tech article, not an official spec — [SlashGear](https://www.slashgear.com/2009446/never-plug-power-hungry-devices-xbox-usb-port)
- In energy-saving mode, USB ports get no power when the console is off. Keeping power needs Instant-on/Sleep (Settings > General > Power options), with "When Xbox is off, turn off storage" unchecked — [Technobezz](https://www.technobezz.com/xbox-series-x-controller-not-charging-fix)
- Sleep mode draws about 13 W versus about 0.5 W for Shutdown — [TechRadar](https://www.techradar.com/how-to/how-to-change-your-xbox-series-x-power-options)
- Shutdown (energy saving) is the default on Series X|S — [GamesRadar](https://www.gamesradar.com/xbox-series-x-standby-mode-explained)
- A user reports a controller not charging over USB while the Xbox is off — [Razer Insider](https://insider.razer.com/general-discussion-6/razer-wolverine-v3-won-t-charge-when-xbox-is-off-84311)
- ESP32-class Wi-Fi TX peaks reach about 500 mA, and weak cables or regulators cause brownout resets — [Hackaday.io C3 Super Mini](https://hackaday.io/project/205906-esp32-c3-super-mini-wifi-fix-3-methods-that-work)
- Board regulators are rated 800 mA: T-Dongle-S3 (USB in 4.8–5.5 V, 800 mA max) and S3-Zero's ME6217 — [LilyGO wiki](https://wiki.lilygo.cc/products/t-dongle-series/t-dongle-s3/); [Waveshare](https://www.waveshare.com/esp32-s3-zero.htm)

### Inferences
- Power should be fine. Set the HID descriptor's `bMaxPower` to a sane value (e.g. 500 mA) and use a short, good cable to avoid voltage drop at TX peaks.
- If the bridge must wake the Xbox or be ready instantly, the user needs Sleep mode. Otherwise firmware should boot quickly and reconnect to Wi-Fi on every console power-on.
- The Arduino-ESP32 suspend issue (#10831) is worth noting if USB remote-wakeup of the Xbox from a keyboard is ever attempted.

### Gaps
- No official Microsoft spec for the Series X|S USB-A port current was found.
- It is unconfirmed whether Xbox supports USB remote wakeup from a HID keyboard.
- No source covers whether Xbox briefly drops VBUS when entering Sleep.

## Cabling for each board

### Takeaway
The Xbox Series X|S has USB-A ports. USB-C boards (QT Py, XIAO, S3-Zero) need a **USB-A (male) to USB-C (male) data cable**, ideally short (0.3–1 m) and explicitly labeled data/sync, not "charging". Pico W / Pico 2 W need **USB-A to micro-B data**. The LilyGO T-Dongle-S3 plugs directly into USB-A with no cable. Flashing from a modern Mac needs either a **USB-C to USB-C data cable** for USB-C boards or a USB-C to USB-A adapter/hub.

### Cited Findings
- QT Py ESP32-S3 uses USB Type-C — [Adafruit](https://www.adafruit.com/product/5426)
- ESP32-S3-Zero uses USB Type-C — [Waveshare](https://www.waveshare.com/esp32-s3-zero.htm)
- T-Dongle-S3 has a USB Type-A plug form factor — [LilyGO wiki](https://wiki.lilygo.cc/products/t-dongle-series/t-dongle-s3/)
- Weak USB cables can cause brownout resets during Wi-Fi TX peaks — [Hackaday.io](https://hackaday.io/project/205906-esp32-c3-super-mini-wifi-fix-3-methods-that-work)

### Inferences
- **Shopping list for the primary pick:**
  - QT Py ESP32-S3 or XIAO ESP32S3
  - One short USB-A to USB-C data cable (e.g. an Anker or Amazon Basics "USB-A to USB-C 2.0" cable, 1 ft / 3 ft, about $6–10) for the Xbox
  - One USB-C to USB-C cable for the Mac (the user likely already has one)
- **T-Dongle-S3:** the Xbox needs nothing. A Mac with only USB-C ports needs a USB-C (male) to USB-A (female) OTG adapter (about $5–8) to flash it.
- A 90° or short cable keeps the board from hanging off the console. A small USB-A extension may help clearance on the Series S.

### Gaps
- No specific cable listings or prices were fetched; the cable prices above are estimates.

## Most beginner-friendly and robust option

### Takeaway
**Most beginner-friendly and robust: an ESP32-S3 board from a reputable vendor (Adafruit QT Py ESP32-S3 or Seeed XIAO ESP32S3) running Arduino-ESP32 with USB-OTG (TinyUSB) mode, CDC disabled at runtime, and Wi-Fi OTA.** The Pico 2 W is a good-value alternative but has less evidence of USB HID and Wi-Fi coexisting. Generic Super Minis are cheapest but have the most quality risk.

### Cited Findings
- A working ESP32-S3 Wi-Fi to USB HID keyboard bridge exists on the QT Py ESP32-S3 (Arduino) — [touchgadget/usbkwa](https://github.com/touchgadget/usbkwa)
- Adafruit guide coverage: CircuitPython HID plus Web Workflow on ESP32-S3 — [Adafruit](https://learn.adafruit.com/customizing-usb-devices-in-circuitpython/hid-devices); [Adafruit](https://learn.adafruit.com/getting-started-with-web-workflow-using-the-code-editor.md?view=all)
- Pico W TinyUSB + Wi-Fi conflict report was left unresolved — [Arduino forum](https://forum.arduino.cc/t/raspberry-pico-w-using-tinyusb-and-wifi-in-parallel/1078641)
- Super Mini antenna quality concerns — [espboards.dev](https://espboards.dev/esp32/esp32-s3-super-mini/)

### Inferences
- **Final recommendation:** buy the Seeed XIAO ESP32S3 if the QT Py remains out of stock. It is cheap, widely stocked on Amazon US with 1–2 day Prime shipping to AZ, and has 8 MB PSRAM plus an external-antenna option. The QT Py is the first choice when in stock, because a known project uses it and Adafruit's docs are better.
- **Alternatives:**
  - LilyGO T-Dongle-S3 for a cable-free USB-A stick (AliExpress, slower shipping)
  - Waveshare ESP32-S3-Zero for the lowest cost from a reputable maker (Amazon US / Waveshare store)
- Buy two boards: one stays in the Xbox, and the other is the dev unit on the Mac.

### Gaps
- No hands-on reports of an ESP32-S3 HID composite device on an Xbox Series X|S specifically were found. Xbox keyboard/mouse support is per-game, and console acceptance of composite descriptors should be tested early.
