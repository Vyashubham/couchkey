# Risks and Hard Limits of a Wi-Fi USB HID Keyboard/Mouse Bridge (Couchkey) on Xbox Series X|S

Research date: 2026-11-14. Scope: an ESP32-class microcontroller that enumerates as a standard USB keyboard + mouse on an Xbox Series X|S, driven over the home LAN. It does not emulate an Xbox controller. Several fetches failed (Windows Central, TechSpot 403, support.xbox.com rendered empty, and the 2026 Call of Duty blog timed out). Where a point depends on a search-result summary instead of a full-page read, that is flagged.

## Policy / ban risk (Community Standards, MSA, 2023 accessory block, Ricochet)

### Takeaway
Microsoft's rules forbid "unauthorized hardware or accessories" in general terms. In practice, though, enforcement has gone after (a) unlicensed controllers that fail Xbox controller authentication (the Nov 2023 block, error 0x82d60002) and (b) in-game cheating devices such as Cronus Zen and XIM, detected through game behaviour (Call of Duty Ricochet). Microsoft has supported plain USB keyboards and mice as first-class input since 2018. For menus, Edge, and media apps, the realistic ban risk is **low**. Confidence: medium-high. Risk rises only if the device is used to automate or script input in competitive online games.

### Cited Findings
- The Xbox Community Standards list as prohibited: "Use unauthorized hardware or accessories" and "Use XBOX services with modified or tampered hardware". Consequences range from temporary multiplayer and communication restrictions to permanent suspension of a profile or device "if we can no longer trust it", which forfeits licences. Strikes last 6 months. — [Xbox Community Standards](https://www.xbox.com/en-US/legal/community-standards)
- The Xbox terms reportedly let Microsoft automatically check devices for unauthorized hardware or software that enables cheating or tampering. This comes from a third-party archive of the terms and was not verified on Microsoft's own page. — [ConductAtlas: Xbox Terms of Use provision](https://conductatlas.com/platform/xbox/xbox-terms-of-use/provision/CA-P-030464/xbox-automatic-cheating-and-tampering-detection/)
- Microsoft officially supports keyboards and mice. The Sept 25, 2018 Xbox Wire post says "most wired or wireless USB keyboards and mice will work on Xbox One". Games opt in title by title, and developers decide how to keep play fair. (This is older but foundational.) — [Xbox Wire, 2018](https://news.xbox.com/en-us/2018/09/25/mouse-and-keyboard-support-for-xbox-one-developers/)
- The Chromium-based Edge on Xbox has full mouse and keyboard support. Office on the web also works with a mouse and keyboard on the console. — [Windows Central](https://windowscentral.com/yes-you-can-use-office-xbox-series-xs-mouse-and-keyboard)
- The Oct/Nov 2023 policy: Microsoft's statement says "Unauthorized accessories can compromise the gaming experience on Xbox consoles" and "Eventually, the unauthorized accessory will be blocked from use". Users get a warning first, with error 0x82d60002, and blocking began Nov 12, 2023. Licensed (Designed for Xbox) accessories such as SCUF, Razer, and Turtle Beach are unaffected. Brook Wingman XB 2 and XB Fighting Board were affected. The statement and article do **not** mention keyboards or mice. — [Pure Xbox](https://www.purexbox.com/news/2023/11/new-xbox-policy-to-block-unauthorised-accessories); [VGC](https://videogameschronicle.com/news/microsoft-has-reportedly-started-blocking-unauthorised-xbox-accessories); [TrueAchievements](https://www.trueachievements.com/n55407/xbox-blocking-unauthorized-controllers-error-0x82d60002)
- Windows Central reported (2023) that an XIM forum admin said XIM devices would not be blocked, because the console talks directly to the genuine authentication controller plugged into the XIM. This is from a search summary; the full article fetch failed. — [Windows Central](https://www.windowscentral.com/gaming/xbox/as-microsoft-blocks-xbox-fighting-game-and-disability-accessories-xim-cheaters-will-escape-the-ban)
- Windows Report characterizes Cronus Zen as not banned at the console level but "borderline cheating". This is press opinion, not official. — [Windows Report](https://windowsreport.com/?p=1316400)
- Activision Ricochet history. In April 2023, Ricochet announced detection of third-party input hardware (Cronus, XIM); a first detection gave a warning rather than an outright ban. — [MP1st](https://mp1st.com/news/call-of-duty-warzone-2-ricochet-anti-cheat-update-will-now-detect-third-party-hardware-like-cronus-and-more); [TechPowerUp](https://techpowerup.com/307322/activision-bungie-and-ubisoft-cracking-down-on-input-device-hardware-modifications?cp=2)
- Activision Ricochet in Feb 2026 (Black Ops 7 Season 02). Its new detections target "unapproved input-modification devices". Because Cronus Zen and XIM are highly configurable, "there is no single signature to block", so it looks for patterns of machine-driven behaviour. This is from a search-result summary; the page fetch timed out. Insider Gaming adds cloud-based system verification before matches. — [Call of Duty blog, Feb 2026](https://www.callofduty.com/blog/2026/02/call-of-duty-black-ops-7-ricochet-anti-cheat-season-02); [Insider Gaming](https://insider-gaming.com/ricochet-anti-cheat-update-ranked-play-mod-devices/); [Gaming Trend](https://gamingtrend.com/news/cronus-zen-crackdown-coming-as-part-of-season-2-ricochet-update-in-black-ops-7-and-warzone/)
- Activision Ricochet in Sept 2026 describes pairing detection with legal action and "improved hardware banning capabilities". This is from a search summary. — [Call of Duty blog, Sept 2026](https://www.callofduty.com/blog/2026/09/ricochet-taking-on-the-cheating-ecosystem)

### Inferences
- **Two enforcement mechanisms exist, and they work differently.**
  1. The **console-level** block works at the controller-authentication layer. It targets devices that claim to be Xbox gamepads but are not licensed.
  2. **Game-level** anti-cheat (Ricochet) flags inhuman or machine-like input patterns during matches.

  Couchkey enumerates as standard HID keyboard/mouse classes, which Microsoft explicitly supports. So it is not the class of device the 2023 block targeted. Confidence: medium-high. There is no official statement on generic HID keyboards specifically, but the 2018 support statement is broad.
- **Use in menus, Edge, and media apps: low risk.** No anti-cheat runs there. A USB keyboard/mouse is a supported input. Couchkey's traffic is indistinguishable at the USB descriptor level from a cheap generic keyboard, provided it uses ordinary descriptors. Confidence: medium.
- **Use in competitive online games: moderate risk, and only if misused.** Scripted macros, perfectly timed inputs, or aim automation could match the "machine-driven behaviour" heuristics Ricochet now uses (2026). The "unauthorized hardware" wording in the Community Standards gives Microsoft or publishers discretion. Confidence: medium.
- **Mitigations:**
  - Document that Couchkey is for UI/text/media, not gameplay.
  - Do not ship macro or turbo/rapid-fire features.
  - Optionally add a "game mode lockout" or rate cap.
  - Use generic HID descriptors and do not spoof Microsoft/Razer VID/PIDs. Spoofing could be read as tampering and could collide with licensed-device handling.
  - Use a pid.codes or other legitimately obtained VID/PID.
- **Licensing gray area, low practical risk.** Microsoft could theoretically extend the "unlicensed accessory" block to non-licensed keyboards. There is no evidence it has done so as of 2026, and doing so would break most consumer keyboards. Confidence: medium.

### Gaps
- No official Microsoft statement was found that addresses generic USB keyboards/mice, or keyboard-and-mouse adapters, under the 2023 "unauthorized accessories" policy.
- I could not read the full text of the 2026 Call of Duty blog (fetch timed out). Its quotes come from search summaries.
- I found no documented case of an account banned merely for using a generic or DIY USB HID keyboard on Xbox.
- The current MSA text on cheating devices was not fetched directly.

## Hard technical limits (controller auth, wake/power, device limits)

### Takeaway
A DIY device cannot pose as an Xbox controller without a genuine controller or licensed auth dongle passed through. GP2040-CE states it supports Xbox One/Series "using passthrough authentication only". Plain HID keyboard/mouse needs no authentication, which is the core design choice of Couchkey. I found no evidence that a USB HID device can power on an Xbox Series console. Sleep mode supports network remote wake (SmartGlass) and is generally reported to keep USB powered. Shutdown (energy saving) uses about 0.5 W, does not support remote wake, and is reported to leave USB ports unpowered.

### Cited Findings
- From the GP2040-CE FAQ:
  - Xbox One and Series consoles are supported "using passthrough authentication only".
  - The Xbox One mode "requires the use of an authentication device".
  - These consoles "implement security measures that prevent unauthorized accessories from being used".
  - Native support would come only "if a user-friendly and completely legal implementation method is found".

  — [GP2040-CE FAQ](https://gp2040-ce.info/faq/faq-general/)
- GP2040-CE credits Santroller and GIMX for Xbox One authentication via pass-through. Its compatibility list names auth adapters such as the MagicBoots FPS Adapter for Xbox One and Magic-X. Some boards have a dedicated USB passthrough port for auth dongles. — [GP2040-CE GitHub](https://github.com/OpenStickCommunity/GP2040-CE); [OpenStickCommunity Passthrough board README](https://www.github.com/OpenStickCommunity/Hardware/blob/main/Boards/GP2040-CE%20Official%20Boards/RP2040%20Advanced%20Breakout%20Board/RP2040%20Advanced%20Breakout%20Board%20-%20Passthrough/README.md)
- The 2023 block affected Brook's Wingman XB 2 and XB Fighting Board. These are third-party controller-emulating devices. — [Pure Xbox](https://www.purexbox.com/news/2023/11/new-xbox-policy-to-block-unauthorised-accessories)
- The XIM avoids blocks because the console authenticates against a real controller connected to it (XIM admin, reported). — [Windows Central](https://www.windowscentral.com/gaming/xbox/as-microsoft-blocks-xbox-fighting-game-and-disability-accessories-xim-cheaters-will-escape-the-ban)
- Power use: Shutdown (energy saving) is about 0.5 W versus about 10–15 W in Sleep. Shutdown boots slower and "does not support remote wake". — [GamesRadar](https://www.gamesradar.com/xbox-series-x-standby-mode-explained); [Tom's Guide](https://www.tomsguide.com/news/microsoft-is-switching-your-xbox-series-x-to-energy-saving-mode-heres-what-that-means)
- USB power by mode, third-party blog (Xbox One-era terms): Instant-On "keeps the USB ports powered, meaning you can charge your controller". In Energy Saver "the USB ports are inactive, and your controller will not charge". This is not an official Microsoft source. — [MacMyths](https://macmyths.com/how-to-use-xbox-energy-saving-mode/)
- Wake behaviour:
  - Third-party troubleshooting guides say wired controllers or connected USB accessories can sometimes wake a console in Sleep.
  - No source confirms that a USB keyboard can wake a fully shut-down Series console.
  - The Xbox support page on power modes did not render via fetch.

  — [Online Tech Tips](https://www.online-tech-tips.com/computer-tips/why-your-xbox-one-turns-on-by-itself-and-10-ways-to-fix-the-issue/)
- Wireless USB-dongle keyboards generally work, and native Bluetooth keyboards/mice are not supported. This is from third-party guides. — [SlashGear](https://www.slashgear.com/1177672/how-to-use-a-keyboard-and-mouse-on-the-xbox-series-x); [Gfinity](https://www.gfinityesports.com/xbox-series-x/xbox-series-x-s-how-to-connect-and-use-a-mouse-and-keyboard-guide/)

### Inferences
- **Controller emulation is a hard limit.** Confidence: high. Doing it would need either a genuine controller or licensed dongle in the device, which means extra hardware and cost and runs into the "unauthorized accessory" policy, or cracking Microsoft's authentication, which is legally risky. Couchkey's keyboard/mouse-only design avoids this entirely.
- **Consequence of the keyboard/mouse-only design.** Confidence: medium-high. A keyboard and mouse cannot press the Xbox (Guide) button the way a controller does. Some UI and most games that don't opt into keyboard/mouse will not accept the input. Xbox does map some keys for system navigation (arrows, Enter, Esc, Windows key → Guide on Xbox per common reports), but **the Windows-key → Guide mapping needs verification on hardware**. No authoritative source was fetched.
- **Power-on.** Confidence: medium. Use the SmartGlass/network wake path (Sleep mode) for power-on. Do not count on USB remote wakeup. The microcontroller should also expect to lose USB bus power when the console is in Shutdown mode (energy saving) and to cold-boot when the console powers on.
  - Mitigation: power the ESP32 from a separate USB wall supply. Couchkey's Wi-Fi and pairing state then stay up regardless of console power state. Use the Xbox port for data only, or with VBUS sensing so the device detects when the host appears.
  - Caveat: back-powering. With a separate supply, VBUS from the external supply must **not** be tied to the Xbox's VBUS. Use VBUS sense through a divider, or a diode or power mux.
- **HID device count.** I found no documented limit on the number of HID devices. In practice the Xbox has 3 USB-A ports on Series X and 2 on Series S. A single composite device (keyboard + mouse + optional consumer-control) uses one port. Confidence: medium; the port counts are from general knowledge and not sourced here.
- **Media keys.** Consumer Control (media keys) support on Xbox is unverified. Hardware testing is needed.

### Gaps
- No official Microsoft documentation was found on USB VBUS behaviour in Sleep vs Shutdown on Series X|S. The only source is a third-party blog about Xbox One "Instant-On/Energy Saver".
- No source was found on whether Xbox honours USB remote-wakeup (the bmAttributes bit) from a HID device in Sleep mode. This is testable on hardware.
- No documented limit on the number of concurrent HID devices or HID report-rate limits on Xbox.
- Which keys map to Guide or other system functions on Xbox was not confirmed from an authoritative source.

## Security risks of a LAN-exposed keystroke injector

### Takeaway
Couchkey is functionally a network-controlled BadUSB. Anyone who can reach its control endpoint can type and click on the console as the signed-in user. That reaches messages, settings, the Store (purchases with saved payment unless a passkey/PIN is required), and Edge with signed-in sessions. Comparable projects show the risk: TinyPilot's open-source build ships with no authentication or TLS and says to use it only on trusted networks, and WiFi Duck ships with default credentials and no login. Severity: **high if unauthenticated**. Mitigations are well understood: pairing plus per-client tokens, encryption, input refused when unpaired, rate limits, a physical arm switch, and a dead-man auto key-up.

### Cited Findings
- **TinyPilot.**
  - The open-source TinyPilot "does not support authentication or transport-level encryption"; for untrusted networks it points to TinyPilot Pro (password auth + TLS). — [TinyPilot GitHub/README via search](https://github.com/tiny-pilot/tinypilot/wiki/Enabling-HTTP-Basic-Authentication-with-TinyPilot)
  - Community wikis document adding HTTP Basic Auth and SSL. — [TinyPilot wiki: SSL](https://github.imc.re/tiny-pilot/tinypilot/wiki/Enabling-SSL-with-TinyPilot)
  - TinyPilot Security Advisory #001 (Feb 2021) covered an insecure CA certificate shipped on devices. It is a reminder that per-device secrets must be unique. — [TinyPilot Advisory 001](https://tinypilotkvm.com/pages/advisory001)
- **PiKVM.** The docs warn that default credentials (admin/admin web, root/root OS) must both be changed. 2FA (TOTP) has been available since KVMD 3.196 and is "strongly recommended" when exposed to the Internet. — [PiKVM auth docs](https://docs.pikvm.org/auth/); [PiKVM first steps](https://docs.pikvm.org/first_steps)
- **WiFi Duck** (ESP8266 Wi-Fi BadUSB):
  - It uses default SSID and password "wifiduck" and a web UI at 192.168.4.1.
  - A fork advertises "you don't need to log in".
  - OTA update is exposed at /update with the default password.

  — [WiFi Duck docs](https://docs.spacehuhn.com/wifiduck/howitworks/); [Spacehuhn blog](https://blog.spacehuhn.com/wifi-duck); [Aircoookie/WiFiDuck README](https://github.com/Aircoookie/WiFiDuck/blob/master/README.md)
- MITRE ATT&CK catalogues IP-KVM and remote-access hardware as an adversary technique (T1219.003). — [MITRE ATT&CK T1219.003](https://attack.mitre.org/techniques/T1219/003)

### Inferences
Threat model:
- **Who:** guests, roommates, or compromised IoT devices on the same Wi-Fi.
- **Their impact:** they could type into the console, send Xbox messages, change settings, browse Edge sessions, or attempt purchases.
- **Worst case:** a misconfigured port-forward or UPnP exposes the device to the Internet.
- **Other attack paths:** an unauthenticated OTA endpoint lets an attacker reflash the firmware into a general-purpose BadUSB, which matters if the device is later plugged into a PC. A fallback SoftAP with default credentials is another entry point.

Confidence: high that these are real risks. Severity depends on the user's Xbox purchase-protection settings, which were not researched here.

Recommended mitigations:
1. **Pairing.** On first boot, show a one-time code. Couchkey has no screen, so it could type the code into a text field on the Xbox via HID, or show it on the serial log or an LED pattern. Pairing issues long-random per-client tokens, stored hashed. Reject all HID commands when no client is paired.
2. **Authenticated and encrypted transport.**
   - Use TLS (self-signed and pinned at pairing), or an application-layer AEAD (e.g. a Noise or libsodium secretbox session) keyed from the pairing secret.
   - Include replay protection with sequence numbers or nonces.
   - Never use static default passwords. Avoid HTTP Basic auth without TLS.
3. **No default SoftAP with fixed credentials.**
   - Use a provisioning AP only on button press, with a time limit and per-device random credentials.
   - Disable mDNS/UPnP advertisement of control endpoints beyond what is needed.
   - Never port-forward.
4. **Signed or authenticated OTA only.** Use ESP-IDF secure boot and flash encryption where feasible. An OTA push from a non-paired client must be impossible.
5. **Rate limits and caps.** Cap keystroke rate (e.g. human-plausible CPS), payload length per command, and the number of failed auth attempts.
6. **Physical controls.** Use a hardware "arm" switch or button. An LED shows when the device is armed or a client is connected. Disarm automatically after N minutes idle.
7. **Network hygiene in the docs.** Recommend a guest/IoT VLAN or SSID with client isolation where the controller can still reach the device. Note that AP isolation can also break the phone→device path, so document the trade-off.
8. **Account-side hardening.** Advise users to require a passkey/PIN for purchases and sign-in on the Xbox. That limits damage from any injected input.

Plugged into a PC by mistake: the device is a generic HID, so it would type on whatever host it is plugged into. Mitigations:
- Accept input only after a client explicitly targets this device ID.
- Optionally fingerprint the host: Xbox vs PC enumeration differs, for example in the descriptor requests and order the host sends. This is unverified and heuristic, so treat it as best effort.
- Default to "disarmed" on every new USB enumeration until a paired client confirms.
- Use a distinct product string ("Couchkey HID bridge") so it is identifiable in OS device lists.

### Gaps
- No public security write-up or CVE was found that specifically analyses Wi-Fi HID bridges used with consoles.
- The current Xbox purchase-protection defaults (passkey for purchases) were not researched.
- No authoritative source was found on fingerprinting an Xbox host vs a PC host via USB enumeration.

## Reliability risks (re-enumeration, stuck keys, brownouts, heat)

### Takeaway
The main reliability hazards follow from the device's own design rather than from Xbox-specific bugs:
- The device loses USB power and must re-enumerate across console power cycles.
- A network drop mid-press can leave a key stuck down.
- ESP32 Wi-Fi TX bursts can cause brownout resets on marginal USB power.

All of these have standard mitigations. Xbox-specific behaviour (re-enumeration after system updates) is undocumented and needs hardware testing.

### Cited Findings
- ESP32 Wi-Fi TX bursts can draw up to about 500 mA. If the supply can't deliver it instantly, the voltage dips and the brownout detector resets the chip. Some host USB ports current-limit at 100–300 mA. Suggested fixes:
  - 470–1000 µF bulk capacitance near the module
  - a stronger supply
  - reduced TX power, e.g. `WiFi.setTxPower(WIFI_POWER_8_5dBm)`

  These come from community troubleshooting guides, not Espressif documentation. — [espboards.dev brownout](https://www.espboards.dev/troubleshooting/issues/power/esp32-brownout-reset/); [espboards.dev USB current limit](https://www.espboards.dev/troubleshooting/issues/power/esp32-usb-current-limit/); [Universal-Solder](https://www.universal-solder.ca/troubleshooting-esp32-brownout/)
- An ESP32-S3 Wi-Fi current peak of about 2 ms tripped a 250 mA supply's over-current limit (forum report). — [EEVblog forum](https://www.eevblog.com/forum/projects/reducing-esp32-s3-current-peaks-during-wifi/)
- Wi-Fi startup power calibration creates a spike that can trip brownout (forum). — [esp32.com](https://esp32.com/viewtopic.php?p=21162)
- An ESP32-S3 DevKit brownout case needed a USB replug to recover (forum). — [Arduino forum](https://forum.arduino.cc/t/esp32-s3-devkit-brownout-and-need-usb-to-reset/1247185)
- USB drives draw a small amount of power from the Xbox USB port. Sleep mode has a separate "turn off storage when off" option. — [The Tech Gorilla](https://thetechgorilla.com/when-xbox-is-off-turn-off-storage/)

### Inferences
- **Stuck keys.** Confidence: high, from standard HID semantics: a key-down report persists until a key-up report arrives. Mitigations:
  - A firmware watchdog that sends an all-keys-up and buttons-released report when:
    - no client heartbeat has arrived for about 300–500 ms while any key is held
    - the Wi-Fi or socket disconnects
    - before reboot or OTA
  - Prefer atomic "tap" commands (press+release in firmware) over separate down/up messages from the client.
  - Cap maximum hold duration.
- **Re-enumeration.** Confidence: medium. Expect the console to drop and re-enumerate the device on Sleep↔On, Shutdown→On, system updates, and console restarts.
  - Firmware should tolerate USB suspend/resume and bus reset without rebooting the Wi-Fi stack. On ESP32-S2/S3 TinyUSB, handle the `tud_suspend_cb`/`tud_resume_cb`/`tud_mount_cb` callbacks.
  - Queue or reject input while the device is unmounted, rather than buffering and replaying stale keystrokes.
  - Report USB mount state to the client.
- **Power.** Confidence: medium.
  - Brownout risk is higher when the device runs off the Xbox port alone, with an unknown current limit and possible VBUS loss in Shutdown.
  - Mitigations: bulk capacitance, a reduced TX power option, and keeping the brownout detector enabled (don't disable it as a "fix"). Optionally power from an external 5 V supply with VBUS sensing (see back-powering caveat above).
  - Use an ESP32-S2/S3, which has native USB OTG. Avoid an ESP32 + USB-serial bridge, which cannot do HID.
- **Heat.** Confidence: low-medium; no specific source found. An ESP32 module draws roughly 0.2–0.5 W. Self-heating is minor, but an enclosed TV cabinet next to an Xbox exhaust can be warm.
  - Keep the device out of the console's exhaust path.
  - Use the ESP32's internal temperature sensor to log or throttle.
  - Use a short USB extension rather than placing it directly at the rear vents.
- **Wi-Fi.** Confidence: medium. 2.4 GHz-only ESP32s in a cabinet behind a TV may have weak signal; expose RSSI in diagnostics. A reconnect loop with exponential backoff, and Wi-Fi power-save off while armed, reduce latency spikes.

### Gaps
- No source documents how the Xbox Series handles USB device re-enumeration across system updates or quick-resume. This needs hardware testing.
- Xbox Series USB port current limits are not published (none found).
- No measured data on thermal conditions in TV cabinets with an Xbox was found.
- Espressif's official hardware-design guideline on brownout/decoupling was not fetched. The figures above come from community sources.

## Legal / ToS for distributing the open-source tool; "Xbox" trademark use

### Takeaway
I found no precedent of takedowns against open-source USB HID/KVM projects (PiKVM, TinyPilot, and WiFi Duck all remain public). GP2040-CE deliberately avoids shipping Xbox auth circumvention for legal reasons. Couchkey, which does no authentication circumvention, has low distribution risk. Confidence: medium. Use "Xbox" only descriptively, e.g. "works with Xbox Series X|S", with a non-affiliation disclaimer and no logos.

### Cited Findings
- GP2040-CE says native Xbox support would only be added "if a user-friendly and completely legal implementation method is found". This signals that the project treats circumventing Xbox authentication as a legal risk. — [GP2040-CE FAQ](https://gp2040-ce.info/faq/faq-general/)
- PiKVM, TinyPilot, and WiFi Duck (an explicit "wireless BadUSB") are public open-source repositories. — [PiKVM docs](https://docs.pikvm.org/auth/); [TinyPilot GitHub](https://github.com/tiny-pilot/tinypilot/wiki/Enabling-HTTP-Basic-Authentication-with-TinyPilot); [WiFi Duck GitHub](https://github.com/spacehuhntech/wifiduck)
- Microsoft's trademark guidelines govern use of its brand assets without a licence. Logos, icons, and similar uses generally require a licence. They allow stating that a product is "interoperable or compatible with" a Microsoft product, as long as the relationship is communicated clearly. — [Microsoft Trademark and Brand Guidelines](https://microsoft.com/legal/intellectualproperty/trademarks)
- "Designed for Xbox" is the official licensed-accessory badge. Licensed accessories are exempt from the 2023 block. — [Windows Central](https://windowscentral.com/gaming/xbox/can-i-use-third-party-accessories-with-xbox); [Pure Xbox](https://www.purexbox.com/news/2023/11/new-xbox-policy-to-block-unauthorised-accessories)
- Activision's Ricochet team states it pairs detection with legal action against the cheating ecosystem (2026). Its targets are commercial cheat-device sellers. — [Call of Duty blog, Sept 2026](https://www.callofduty.com/blog/2026/09/ricochet-taking-on-the-cheating-ecosystem)

### Inferences
- **Distribution risk: low.**
  - Couchkey uses only standard USB HID classes and Microsoft's publicly reverse-engineered SmartGlass LAN protocol.
  - It contains no authentication bypass, which keeps it away from DMCA §1201 anti-circumvention concerns.
  - It is not marketed as a cheat device.
  - Legal action in this space has targeted commercial cheat sellers (2026 Activision statement), not general-purpose input tools.

  Confidence: medium. I did not research DMCA case law, and this is not legal advice.
- **Trademark practice:**
  - Name the project "Couchkey" (no "Xbox" in the name).
  - Describe it as "a keyboard/mouse remote for Xbox Series X|S consoles".
  - Add a disclaimer: "Not affiliated with or endorsed by Microsoft. Xbox is a trademark of Microsoft Corporation."
  - Do not use the Xbox logo, the "Designed for Xbox" badge, or Xbox-green trade dress.
  - Do not use Microsoft VID/PIDs.
- **Avoid red-flag features.** Do not ship features (macros, rapid fire, aim assist) that would let the project be characterized as a cheat device. Those features would raise both ban risk for users and legal or platform risk (e.g. GitHub DMCA takedowns) for maintainers.

### Gaps
- No source was found documenting takedowns (or their absence) of open-source KVM or HID projects. The statement "none known" rests on these projects still being publicly available, not on a systematic search.
- Xbox-specific trademark or brand guidelines for third-party "works with Xbox" software and hardware were not found. Only the general Microsoft guidelines were.
- The legal status of the SmartGlass protocol reimplementation (interoperability exemption) was not researched here.
