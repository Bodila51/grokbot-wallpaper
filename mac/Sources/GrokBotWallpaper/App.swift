import AppKit
import ServiceManagement

/// Grok Bot Wallpaper for macOS, the Mac counterpart of the Lively setup on Windows: the wallpaper page live
/// on every display, the eyes following the cursor, and a menu-bar icon for the few settings.
@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)            // no Dock icon, only the menu-bar icon
        withExtendedLifetime(delegate) { app.run() }
    }

    private var wallpapers: [CGDirectDisplayID: Wallpaper] = [:]
    private var feed: CursorFeed!
    private var statusItem: NSStatusItem!
    private var dragItem: NSMenuItem!
    private var loginItem: NSMenuItem!
    private var dragMode = false
    private var dragSince = Date.distantPast
    private var escMonitor: Any?
    private var screensAsleep = false
    private var sessionAway = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        feed = CursorFeed()
        installEditMenu()
        buildStatusItem()
        syncWallpapers()

        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged),
                                               name: NSApplication.didChangeScreenParametersNotification, object: nil)
        let workspace = NSWorkspace.shared.notificationCenter
        workspace.addObserver(self, selector: #selector(screensSlept), name: NSWorkspace.screensDidSleepNotification, object: nil)
        workspace.addObserver(self, selector: #selector(screensWoke), name: NSWorkspace.screensDidWakeNotification, object: nil)
        workspace.addObserver(self, selector: #selector(sessionLeft), name: NSWorkspace.sessionDidResignActiveNotification, object: nil)
        workspace.addObserver(self, selector: #selector(sessionBack), name: NSWorkspace.sessionDidBecomeActiveNotification, object: nil)
        perform(#selector(checkInstallPlace), with: nil, afterDelay: 1)
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }

    // Clicking any other app ends drag mode, so the icons never stay hidden behind the page.
    func applicationDidResignActive(_ notification: Notification) {
        if dragMode, Date().timeIntervalSince(dragSince) > 1.5 { setDrag(false) }
    }

    // MARK: one wallpaper per display

    // Displays come and go in bursts (wake, rearranging): let them settle, then sync once.
    @objc private func screensChanged() {
        NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(syncWallpapers), object: nil)
        perform(#selector(syncWallpapers), with: nil, afterDelay: 0.5)
    }

    @objc private func syncWallpapers() {
        var present = Set<CGDirectDisplayID>()
        for screen in NSScreen.screens {
            guard let id = screen.displayID else { continue }
            present.insert(id)
            if let wallpaper = wallpapers[id] {
                wallpaper.setFrame(screen.frame)
            } else {
                let wallpaper = Wallpaper(frame: screen.frame, url: Settings.url)
                wallpaper.onLoad = { [weak self] in self?.feed.resend() }
                NotificationCenter.default.addObserver(self, selector: #selector(occlusionChanged),
                                                       name: NSWindow.didChangeOcclusionStateNotification, object: wallpaper.window)
                wallpapers[id] = wallpaper
            }
        }
        for (id, wallpaper) in wallpapers where !present.contains(id) {
            NotificationCenter.default.removeObserver(self, name: NSWindow.didChangeOcclusionStateNotification, object: wallpaper.window)
            wallpaper.close()
            wallpapers[id] = nil
        }
        for wallpaper in wallpapers.values { wallpaper.setInteractive(dragMode) }
        feed.targets = Array(wallpapers.values)
        updateFeed()
    }

    // MARK: battery: the cursor feed runs only while a wallpaper can be seen

    @objc private func occlusionChanged() { updateFeed() }
    @objc private func screensSlept() { screensAsleep = true; updateFeed() }
    @objc private func screensWoke() { screensAsleep = false; updateFeed() }
    @objc private func sessionLeft() { sessionAway = true; updateFeed() }
    @objc private func sessionBack() { sessionAway = false; updateFeed() }

    private func updateFeed() {
        // covered = a full-screen app or windows over every display
        let covered = Settings.pauseWhenCovered && !dragMode && !wallpapers.values.contains(where: { $0.isVisible })
        if screensAsleep || sessionAway || wallpapers.isEmpty || covered { feed.stop() } else { feed.start() }
    }

    // MARK: menu-bar icon

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menu = NSMenu()
        menu.delegate = self
        dragItem = menuItem("Двигать карточки", #selector(toggleDrag))
        loginItem = menuItem("Запускать при входе", #selector(toggleLogin))
        menu.addItem(dragItem)
        menu.addItem(.separator())
        menu.addItem(menuItem("Обновить обои", #selector(reloadWallpapers)))
        menu.addItem(menuItem("Адрес обоев…", #selector(editAddress)))
        menu.addItem(.separator())
        menu.addItem(loginItem)
        menu.addItem(.separator())
        menu.addItem(menuItem("Выйти", #selector(quit), key: "q"))
        statusItem.menu = menu
        updateIcon()
    }

    private func menuItem(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        return item
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        dragItem.state = dragMode ? .on : .off
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }

    private func updateIcon() {
        guard let button = statusItem.button else { return }
        let image = NSImage(systemSymbolName: dragMode ? "hand.draw" : "eyes", accessibilityDescription: "Grok Bot Wallpaper")
        image?.isTemplate = true
        button.image = image
        button.title = image == nil ? (dragMode ? "✋" : "👀") : ""
        button.toolTip = dragMode ? "Двигать карточки: включено (Esc — выключить)" : "Grok Bot Wallpaper"
    }

    // MARK: «Двигать карточки»: the page takes real clicks for a while, above the desktop icons

    @objc private func toggleDrag() { setDrag(!dragMode) }

    private func setDrag(_ on: Bool) {
        guard on != dragMode else { return }
        dragMode = on
        for wallpaper in wallpapers.values { wallpaper.setInteractive(on) }
        if on {
            dragSince = Date()
            NSApp.activate(ignoringOtherApps: true)
            let mouse = NSEvent.mouseLocation
            let underMouse = wallpapers.values.first { NSMouseInRect(mouse, $0.window.frame, false) }
            (underMouse ?? wallpapers.values.first)?.window.makeKey()
            escMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard event.keyCode == 53 else { return event }     // Esc
                self?.setDrag(false)
                return nil
            }
        } else {
            if let monitor = escMonitor { NSEvent.removeMonitor(monitor) }
            escMonitor = nil
            NSApp.deactivate()
        }
        updateIcon()
        updateFeed()
    }

    // MARK: the other menu items

    @objc private func reloadWallpapers() {
        let url = Settings.url
        for wallpaper in wallpapers.values { wallpaper.refresh(url) }
    }

    @objc private func editAddress() {
        let alert = NSAlert()
        alert.messageText = "Адрес обоев"
        alert.informativeText = "Страница, которую показывают обои. Для своих ботов — адрес локального сервера, "
            + "например http://localhost:8787/face/?key=…"
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 440, height: 24))
        field.stringValue = Settings.url.absoluteString
        field.placeholderString = Settings.defaultURL.absoluteString
        alert.accessoryView = field
        alert.addButton(withTitle: "Сохранить")
        alert.addButton(withTitle: "Отмена")
        alert.addButton(withTitle: "По умолчанию")
        alert.window.initialFirstResponder = field
        NSApp.activate(ignoringOtherApps: true)
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            let text = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let url = URL(string: text), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
                  url.host != nil else {
                showAlert("Это не похоже на адрес страницы", "Нужен адрес вида https://… или http://localhost:8787/face/?key=…")
                return
            }
            Settings.url = url
        case .alertThirdButtonReturn:
            Settings.resetURL()
        default:
            return
        }
        reloadWallpapers()
    }

    @objc private func toggleLogin() {
        let service = SMAppService.mainApp
        do {
            if service.status == .enabled {
                try service.unregister()
            } else {
                try service.register()
                if service.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }
            }
        } catch {
            showAlert("Не получилось изменить автозапуск",
                      "\(error.localizedDescription)\n\nВключите вручную: Системные настройки → Основные → Объекты входа.")
            SMAppService.openSystemSettingsLoginItems()
        }
    }

    @objc private func quit() { NSApp.terminate(nil) }

    // Run straight from the downloaded disk image (or from a quarantine copy) the login item would point nowhere.
    @objc private func checkInstallPlace() {
        let path = Bundle.main.bundlePath
        guard path.hasPrefix("/Volumes/") || path.contains("/AppTranslocation/") else { return }
        showAlert("Перенесите приложение в «Программы»",
                  "Сейчас оно запущено прямо из скачанного образа. Перетащите «Grok Bot Wallpaper» в папку «Программы» "
                  + "и откройте оттуда, иначе не заработает «Запускать при входе».")
    }

    private func showAlert(_ title: String, _ text: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = text
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }

    // An app without a menu bar has no Edit menu, so ⌘V would not paste into the address field without this.
    private func installEditMenu() {
        let edit = NSMenu(title: "Правка")
        edit.addItem(withTitle: "Вырезать", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Скопировать", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Вставить", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Выбрать все", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let editItem = NSMenuItem()
        editItem.submenu = edit
        let main = NSMenu()
        main.addItem(editItem)
        NSApp.mainMenu = main
    }
}

enum Settings {
    static let defaultURL = URL(string: "https://bodila51.github.io/grokbot-wallpaper/face/")!

    static var url: URL {
        get { UserDefaults.standard.string(forKey: "wallpaperURL").flatMap { URL(string: $0) } ?? defaultURL }
        set { UserDefaults.standard.set(newValue.absoluteString, forKey: "wallpaperURL") }
    }

    static func resetURL() { UserDefaults.standard.removeObject(forKey: "wallpaperURL") }

    /// `defaults write io.github.bodila51.grokbot-wallpaper pauseWhenCovered -bool false` keeps the eyes fed
    /// even when macOS reports every wallpaper as covered.
    static var pauseWhenCovered: Bool { UserDefaults.standard.object(forKey: "pauseWhenCovered") as? Bool ?? true }
}

private extension NSScreen {
    var displayID: CGDirectDisplayID? {
        (deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
    }
}
