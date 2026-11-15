# Xbox Series X|S compatibility with generic/DIY USB HID keyboards & mice, and per-surface KB/M support

Research date: 2026-11-14. Confidence labels: **[Official]** = Microsoft documentation/announcement; **[Press]** = tech-press guide; **[Anecdotal]** = forum/user report; **[Inference]** = my reasoning. Note: support.xbox.com pages are JS-rendered and could not be fetched by my tools, and answers.microsoft.com Xbox threads now 301-redirect to support.xbox.com. Microsoft's own keyboard-shortcut list therefore could not be retrieved directly, so several claims below rest on press guides.

## 1. Does the console accept any standard USB HID keyboard/mouse (no licensing/auth)? VID/PID allow-lists, boot vs report protocol, composite quirks, DIY devices

### Takeaway
Microsoft's official position since 2018 is that "most wired or wireless USB keyboards and mice will work". It names no certification, authentication or allow-list for KB/M, unlike controllers, which need Microsoft's licensed protocol. I found no public evidence of a VID/PID allow-list and no first-hand report of an ESP32/RP2040/Teensy HID device on Xbox, either working or failing. The design is likely to work, but that is inferred, not proven, so a bench test on a real Series X|S is the first milestone.

### Cited Findings
- [Official] "Most wired or wireless USB keyboards and mice will work on Xbox One"; "Mouse and keyboard input is not enabled by default for games", so developers opt in per title. Microsoft partnered with Razer for a "best possible" experience. — [Xbox Wire, Sept 25 2018](https://news.xbox.com/2018/09/25/mouse-and-keyboard-support-for-xbox-one-developers/)
- [Press] Series X|S accepts wired USB keyboards and mice but not Bluetooth ones. Ports are USB-A. — [SlashGear](https://www.slashgear.com/1177672/how-to-use-a-keyboard-and-mouse-on-the-xbox-series-x); [TechRadar](https://www.techradar.com/how-to/how-to-set-up-a-keyboard-and-mouse-on-xbox-series-x)
- [Press] Wireless USB-dongle (2.4 GHz receiver) peripherals "should also work well, but it's more of a hit or miss". The console "will automatically find the devices" a few seconds after plug-in. USB-C devices need an adapter. — [Popular Science](https://www.popsci.com/diy/xbox-to-keyboard-and-mouse/)
- [Anecdotal] A Logitech K400 Plus (keyboard plus touchpad combo on a unifying dongle, which is a composite HID) reportedly worked on Xbox One and Series X for chat, but the touchpad did not work. — summarized from search results citing a [Microsoft Answers thread](https://answers.microsoft.com/en-us/xbox/forum/xba_console/xbox-one-usb-keyboard-support/93de3351-7f09-4923-8ab3-9cd101ee856b) (thread now redirects, so not verified first-hand)
- [Official] GameInput (the GDK input API, the only one on console for GDK titles) treats keyboards and mice as native device classes. It reports per-device state, assumes keyboards report at 125–1000 Hz, and expects 4–6 simultaneous keys on standard keyboards (12–16 on high-end ones). Mouse data arrives as relative deltas plus wheel X/Y and buttons left, right, middle, 4, 5 and tilt-left/right. Keyboards and mice cannot be associated with a specific user. — [GameInput keyboards and mice (docs.xbox.com)](https://docs.xbox.com/build/core-features/common/input/advanced/input-keyboard-mouse.md); [GameInput overview](https://devdocs.xbox.com/build/core-features/common/input/overviews/input-overview)
- [Official] The October 2025 GDK says GameInput on console provides "one input model for Xbox and PC", supporting keyboard, mouse, gamepad and custom devices. — [Microsoft Game Dev, Oct 2025 GDK](https://developer.microsoft.com/en-us/games/articles/2025/11/october-2025-microsoft-gdk-update/)
- [Anecdotal, general HID, not Xbox-specific] DIY-HID pitfalls from other strict hosts (BIOS/KVM/DeskHop): QMK NKRO descriptors fail on boot-protocol-only hosts. On composite devices, setting the protocol on one interface can affect another. Switching protocol after enumeration is unreliable, and a detach/reattach is the workaround. — [DeskHop issues](https://www.github.com/hrvach/deskhop/issues/50); [keyboard.io forum](https://community.keyboard.io/t/help-with-kvm-keyboard-port-issue/3290/7); [CircuitPython #10120](https://github.colasdn.workers.dev/adafruit/circuitpython/issues/10120)
- No search turned up a report of Flipper Zero BadUSB, Arduino Leonardo, ESP32-S3 or Pico HID used as a keyboard on Xbox. Existing Xbox DIY projects (OGX-Mini, the ESP32-S3 Xbox adapter, Bluepad32) deal with gamepads, not KB/M. — [OGX-Mini](https://github.com/LukeZGD/OGX-Mini); [Flipper BadUSB docs](https://docs.flipper.net/zero/bad-usb)

### Inferences
- [Inference, medium-high confidence] Microsoft says "most" USB keyboards and mice work, and Logitech dongle combos (composite HID with several interfaces) work at least for the keyboard. That suggests the console uses a generic HID class driver keyed on usage pages (Generic Desktop Keyboard 0x06 / Mouse 0x02), not on VID/PID. A TinyUSB composite device should enumerate.
- [Inference] To reduce risk, use separate HID interfaces, one for keyboard and one for mouse, each boot-protocol-capable. Use a standard 8-byte 6KRO boot-compatible keyboard report (no NKRO bitmap) and a standard relative mouse report with buttons, X, Y and wheel (optional AC Pan). Put consumer control in its own report ID or interface so the keyboard interface stays boot-compatible. A plain report-protocol single-interface device with report IDs probably also works, but the boot layout is the safest common denominator. Do not use absolute (digitizer) pointer reports; GameInput and the system expect relative mice.
- [Inference] The K400 touchpad failure may be a precision-touchpad/digitizer collection that the console ignores. Stick to plain mouse usages.
- [Inference] Use a USB 2.0 full-speed device; the ESP32-S3 is FS only. That is fine for KB/M at a 1 ms (1000 Hz) or 8 ms polling interval.

### Gaps
- No official Microsoft statement on boot vs report protocol, HID descriptor requirements, VID/PID filtering, hub behavior or polling-rate limits on Xbox.
- No first-hand report found of a DIY (ESP32/RP2040/Teensy/Arduino) KB/M HID device on Xbox One or Series. This needs an empirical test.
- No data on how many simultaneous keyboards or mice the console accepts. GameInput reports per device, so several are probably allowed.

## 2. System UI (dashboard/guide): which keys/shortcuts work, and does the mouse do anything?

### Takeaway
The keyboard drives the dashboard as a D-pad replacement: arrows move focus, Enter or Space selects, Esc goes back, Tab moves between items, and the Windows key acts as the Xbox button (opens the guide). Win+I (Settings) and Win+X (notifications) are reported. The mouse is largely non-functional in the system UI (Home and Settings). Mouse settings exist under Devices & connections > Mouse, but you have to reach them with a controller.

### Cited Findings
- [Press] Keyboard navigation in menus: "using the arrow keys to move, the Enter key to select, and the Esc key to go back". Tab moves forward and Shift+Tab backward. Win+I opens Settings. Typing works in the top-left dashboard search box. — [Popular Science](https://www.popsci.com/diy/xbox-to-keyboard-and-mouse/)
- [Press] The Windows key replaces the Xbox button for opening the guide. Win+I opens Settings and Win+X opens notifications. "Users can't interact with parts of the Xbox UI using the mouse", e.g. the Home screen. There is a "total lack of mouse support within the Settings menu". The full shortcut list is on the Xbox support site. — [SlashGear](https://www.slashgear.com/1177672/how-to-use-a-keyboard-and-mouse-on-the-xbox-series-x)
- [Press, Xbox One era] The Windows key opens the guide, Space or Enter selects, Escape or Win+Backspace goes back, and arrow keys plus Tab move between tiles. — Windows Central "List of Xbox One mouse and keyboard controls and shortcuts" (page body could not be fetched; summarized from search snippet) [windowscentral.com](https://windowscentral.com/xbox-one-mouse-and-keyboard-shortcuts); the Windows key performs the same action as the Xbox button — [Wikimili "Windows key"](https://wikimili.com/en/Windows_key)
- [Press] Mouse "won't work on the main Xbox interface and menus". Settings > Devices & connections > Mouse lets you change pointer speed and swap the primary and secondary buttons. There are no keyboard-specific settings. The same article elsewhere says KB/M "will work everywhere in the Xbox menus", which is internally contradictory; the "mouse doesn't work in dashboard" reading is corroborated by SlashGear. — [Popular Science](https://www.popsci.com/diy/xbox-to-keyboard-and-mouse/)
- [Press] A beta Insider feature lets players map keyboard keys to controller buttons. — [TechRadar](https://techradar.com/gaming/consoles-pc/xbox-series-x-users-will-soon-be-able-to-map-keyboard-keys-to-their-controllers)

### Inferences
- [Inference, high confidence] For a remote-control bridge, the keyboard path (arrows, Enter, Esc, Tab, Win, Win+I, Win+X) can drive the whole dashboard and guide without emulating a controller. The mouse adds little outside Edge and opted-in apps or games.
- [Inference, medium] The Win key alone probably maps to "open guide" only. A long-press Xbox button (power menu) has no known keyboard equivalent.

### Gaps
- The official support.xbox.com keyboard shortcut list could not be retrieved (JS-rendered). Unverified for Series X|S in 2025–26: Win+Backspace, Win+Enter, Win+V or other combos, and F-keys. Verify on hardware or open the support page in a browser.

## 3. Microsoft Edge on Xbox: real mouse cursor? Desktop shortcuts? Wheel? Right-click?

### Takeaway
Yes. Chromium Edge, shipped to Xbox in the September 2021 update, officially supports USB mouse and keyboard: you get a real cursor, and Microsoft says keyboard shortcuts work "like any computer". Third-party guides list Ctrl+T, Ctrl+W and Ctrl+L. Edge is the surface where a KB/M bridge adds the most value.

### Cited Findings
- [Official] "Simply plug in your mouse and keyboard into the console's USB port to begin browsing." Keyboard shortcuts work as on a computer. Holding Menu on the controller toggles between gamepad and mouse control. Controller mappings: B back, X new tab, Y history, LB/RB previous and next tab, View opens the address bar, left stick scrolls, right stick zooms. — [Microsoft Edge learning center](https://www.microsoft.com/en-us/edge/learning-center/how-to-use-microsoft-edge-on-xbox)
- [Press] Chromium Edge with mouse/keyboard support arrived in the Xbox September 2021 update, after Insider testing in April 2021 (motivated in part by Stadia). — [PureXbox Sept 2021](https://www.purexbox.com/news/2021/09/xboxs_new_internet_browser_is_out_now_and_its_a_major_improvement); [Windows Central](https://www.windowscentral.com/microsoft-testing-xbox-mouse-and-keyboard-support-edge-browser-welcoming-google-stadia); [WinBuzzer](https://winbuzzer.com/2021/04/27/xbox-series-x-gets-keyboard-and-mouse-support-for-microsoft-edge-xcxwbn/)
- [Press, third-party] Ctrl+T opens a new tab, Ctrl+W closes a tab, Ctrl+L focuses the address bar. — [GeekChamp](https://geekchamp.com/?p=209121)
- [Press] The mouse works in Edge on Xbox. The console version lacks extensions and downloads. — [SlashGear](https://www.slashgear.com/1177672/how-to-use-a-keyboard-and-mouse-on-the-xbox-series-x)
- [Press] Office web apps are usable on Series X|S through Edge with mouse and keyboard. — [Windows Central](https://www.windowscentral.com/yes-you-can-use-office-xbox-series-xs-mouse-and-keyboard)

### Inferences
- [Inference, medium-high] Edge is Chromium, so standard shortcuts very likely work: Ctrl+Tab, Alt+Left/Right, F5, Ctrl+F, Ctrl+plus/minus, the scroll wheel and right-click context menus. Only Ctrl+T, Ctrl+W and Ctrl+L are documented by a source I found.
- [Inference] Browser-based web apps (YouTube TV web, xbox.com/play cloud gaming, Office, any custom web page you host) become fully mouse- and keyboard-controllable through the bridge.

### Gaps
- No source explicitly confirms the scroll wheel, right-click, Ctrl+Tab, Alt+Left, F5 or Ctrl+F on Xbox Edge. These are high-probability but need a hardware test.

## 4. Streaming apps (YouTube, Netflix, Disney+, Prime Video, Twitch, Spotify): does a physical keyboard type into search?

### Takeaway
Evidence is thin and conflicting. Keyboard arrows, Enter and Esc generally act as D-pad, A and B in most apps. Typing into search depends on whether the app uses the system text-input path (the OS on-screen keyboard, which accepts physical keys) or its own custom on-screen keyboard grid (common in Netflix, YouTube and Disney+ TV UIs), which may only accept arrow navigation. The mouse generally does nothing in these apps.

### Cited Findings
- [Press] "Apps such as Microsoft Edge and Netflix let you use the keyboard ... but don't respond to the mouse." — quoted in search summary from a Series X KB/M guide ([Gfinity](https://www.gfinityesports.com/article/xbox-series-x-s-how-to-connect-and-use-a-mouse-and-keyboard-guide) / [TechRadar](https://www.techradar.com/how-to/how-to-set-up-a-keyboard-and-mouse-on-xbox-series-x); exact attribution not verified first-hand)
- [Anecdotal, Xbox One] A user with a Logitech K400r reported they cannot use the QWERTY keyboard to type into Netflix search. — Microsoft Answers thread (redirects now; summarized via search) [link](https://answers.microsoft.com/en-us/xbox/forum/xba_console/xbox-one-usb-keyboard-support/93de3351-7f09-4923-8ab3-9cd101ee856b)
- [Press] YouTube search from the dashboard search box requires a recent system update and the YouTube app. YouTube's own "link with TV code" phone remote lets you type on a phone. — [SeekingTech](https://seekingtech.com/how-to-search-for-youtube-videos-from-the-xbox-series-x-and-s-dashboard/)
- [Anecdotal, other platform] Spotify's TV UI broke external-keyboard typing on Android TV after a GUI update, which shows that custom TV-UI keyboards often ignore hardware keys. — [Spotify Community](https://community.spotify.com/t5/Android/Android-TV-External-Keyboards-Not-Working-Since-GUI-Update/td-p/4944389/highlight/true/page/3)

### Inferences
- [Inference, medium] Plan on navigation-only KB support (arrows, Enter, Esc) in Netflix, YouTube, Disney+, Prime Video, Twitch and Spotify, and treat typed search as a bonus to verify per app. Workarounds if typing fails: (a) the bridge drives the app's custom keyboard grid with arrow keys (automated "type by navigation"); (b) use Edge web versions; (c) use the dashboard search box, which accepts typing, to search into YouTube; (d) use the apps' own phone-link features (YouTube TV code, Netflix second-screen, Spotify Connect).
- [Inference] Many of these Xbox apps are WebView/JS-based TV apps (cf. Microsoft's "Media App for Xbox" JS samples and TVHelpers, [Learn](https://learn.microsoft.com/en-us/windows/uwp/apps-for-xbox/supported-technologies)). Hardware keys reach them as DOM key events, so behavior is up to each app's code.

### Gaps
- No reliable, recent (2024–26), per-app reports for Disney+, Prime Video, Twitch or Spotify on Xbox with a physical keyboard. Reddit, the main source of such reports, was out of scope.

## 5. Games: which support KB/M, and how the console exposes KB/M to games

### Takeaway
KB/M in games is per-title developer opt-in through GameInput (formerly UWP/XDK APIs). It is not enabled by default and there is no system-level KB-to-controller emulation, apart from an Insider-beta key-remapping feature. Notable supporting titles include Fortnite, the Call of Duty games, Halo Infinite, Minecraft, Sea of Thieves, The Sims 4, Warframe (first tester) and Gears titles. Microsoft has historically cited 100+ titles, but I did not retrieve a current official count.

### Cited Findings
- [Official] "Mouse and keyboard input is not enabled by default for games." Each developer decides whether and how. Warframe was among the first testers. — [Xbox Wire 2018](https://news.xbox.com/2018/09/25/mouse-and-keyboard-support-for-xbox-one-developers/)
- [Official] GameInput is the unified API for gamepads, keyboards, mice and other devices on Xbox and Windows, and the only input API for GDK titles on console. Keyboard state is for action mapping, "not meant for regular text input". — [docs.xbox.com GameInput KB/M](https://docs.xbox.com/build/core-features/common/input/advanced/input-keyboard-mouse.md); [input overview](https://devdocs.xbox.com/build/core-features/common/input/overviews/input-overview)
- [Press] Supporting titles cited include The Sims 4, Halo, Sea of Thieves and Minecraft. Some games support the keyboard for chat only. — [Popular Science](https://www.popsci.com/diy/xbox-to-keyboard-and-mouse/); latest Halo and Call of Duty — [SlashGear](https://www.slashgear.com/1177672/how-to-use-a-keyboard-and-mouse-on-the-xbox-series-x)
- [Press] Game-specific KB/M support pages exist (e.g. S.T.A.L.K.E.R. 2, Meet Your Maker). — [STALKER 2 support](https://support.stalker2.com/hc/en-us/articles/29872708263441-How-to-Connect-a-Keyboard-Mouse-with-Your-Xbox); [Meet Your Maker](https://support.meetyourmakergame.com/hc/en-us/articles/19504402218772-Keyboard-and-Mouse-Troubleshooting-Xbox)
- [Press] Xbox Insider beta lets you map keyboard keys to controller buttons. — [TechRadar](https://techradar.com/gaming/consoles-pc/xbox-series-x-users-will-soon-be-able-to-map-keyboard-keys-to-their-controllers)

### Inferences
- [Inference] For games without KB/M support, the bridge's HID path does nothing. Gameplay control needs the existing SmartGlass/gamepad path in this repo or a licensed-controller emulation.
- [Inference] The Microsoft Store on Xbox shows a "Mouse and keyboard" capability tag on supporting titles, a practical way to check per game (from memory; not re-verified).

### Gaps
- The Wikipedia list of Xbox Series KB/M games returned 404 at the URL tried. No current official total count was retrieved.

## 6. Consumer control / media keys (play/pause, volume) via USB HID

### Takeaway
No source found, official or anecdotal, confirms or denies that USB HID Consumer Control usages (Play/Pause 0xCD, Volume 0xE9/0xEA, Mute 0xE2) work on Xbox Series X|S. Treat this as unknown and test it. The console natively supports media transport via the IR Media Remote and HDMI-CEC, so the OS has media-control plumbing.

### Cited Findings
- [Press] Dedicated IR media remotes (PDP, 8BitDo) control playback and volume on Series X|S. That is a separate path from HID. — [8BitDo Media Remote](https://www.8bitdo.com/media-remote-for-xbox); [Engadget](https://www.engadget.com/8-bitdo-xbox-series-x-s-media-remotes-162542127.html)
- [Official] UWP media apps on Xbox use SystemMediaTransportControls, the OS media-key routing on Windows. — [Microsoft Learn supported technologies (sample list)](https://learn.microsoft.com/en-us/windows/uwp/apps-for-xbox/supported-technologies)
- [Official] GameInput's KB/M documentation says nothing about consumer-control usages. — [docs.xbox.com](https://docs.xbox.com/build/core-features/common/input/advanced/input-keyboard-mouse.md)

### Inferences
- [Inference, low-medium] Xbox OS uses SMTC, and Windows routes HID consumer Play/Pause to SMTC, so consumer-control play/pause *may* reach media apps. Volume keys likely do not control TV volume, because the console has no master volume path except through HDMI-CEC and the IR remote. Put consumer control in its own report or interface so a host that rejects it doesn't break the keyboard.
- [Inference] A fallback that is likely to work: keyboard keys that media apps map, such as Space or Enter for play/pause in web-based players inside Edge or apps.

### Gaps
- No evidence either way. This needs a hardware test.

## 7. USB mass storage: Media Player playback from USB, filesystems, microcontroller-as-MSC precedent

### Takeaway
The Xbox "Media Player" app (Store app) plays video and music from USB drives and DLNA servers. exFAT is the safest filesystem for a media-only drive; FAT32 and NTFS are reported to work but sources conflict on NTFS. H.264 in MP4 with AAC or MP3 audio is the most reliable codec combination. No precedent found for a microcontroller (ESP32/RP2040) exposing USB MSC to an Xbox.

### Cited Findings
- [Press] The Media Player app plays files from USB 1.0/2.0/3.0 removable drives and DLNA servers (Xbox One era). — [How-To Geek](https://www.howtogeek.com/255016/how-to-play-video-and-music-files-on-your-xbox-one/)
- [Press, conflicting] Some guides say FAT32, exFAT and NTFS all work for media and FAT16 does not. Others say "NTFS formats will not work" and recommend exFAT. — [Cyberpost](https://cyberpost.co/what-format-is-xbox-external-ssd/); [Acrok](https://www.acrok.com/xbox-series-x-supported-format)
- [Press] Series X Media Player plays only certain H.264 and MPEG files, and HEVC from USB reportedly fails. This contradicts an MKV guide that claims HEVC support. — [Acrok H.265](https://www.acrok.com/xbox-series-x-and-h265); [VideoConverterFactory](https://www.videoconverterfactory.com/tips/xbox-series-mkv.html)
- [Official, for app developers] Codec support on Xbox: H.264 up to 1080p60 High (all consoles); HEVC up to 4K60 Main/Main10 (all except Xbox One); VP9 4K60 (One X, Series X|S); VC1/MPEG2/MPEG4 1080p60. PlayReady is the only DRM. This governs the platform media stack, not the Media Player app's file list. — [Microsoft Learn](https://learn.microsoft.com/en-us/windows/uwp/apps-for-xbox/supported-technologies)

### Inferences
- [Inference] An ESP32-S3 MSC device is USB full-speed (~1 MB/s practical, often less), and flash or SD capacity is small. That is too slow for video and marginal for music. A composite HID+MSC device also increases enumeration risk. DLNA over Wi-Fi from the laptop (Media Player supports DLNA servers) is a far better route for media. A microcontroller could advertise one small FAT32/exFAT volume, but there is no evidence that Xbox handles a slow or tiny MSC device well.
- [Inference] Xbox may offer to format some drives for games/apps. Only ≥128 GB USB 3.0 drives qualify, per long-standing Microsoft guidance not re-verified here, so a tiny MSC volume would just appear as media storage.

### Gaps
- Official support.xbox.com Media Player file-type and filesystem page not retrieved.
- No precedent found for DIY USB MSC on Xbox.
