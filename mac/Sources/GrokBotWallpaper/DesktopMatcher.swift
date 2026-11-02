import AppKit
import WebKit

/// Keeps the system desktop picture equal to the wallpaper. macOS tints the menu bar (and draws Mission Control)
/// from the desktop picture, not from the windows on the desktop, so without this the menu bar shows the colour
/// of the picture hidden under our window. The user's own picture is restored on Quit or when this is turned off.
@MainActor
final class DesktopMatcher: NSObject {
    private var latest: [CGDirectDisplayID: URL] = [:]

    private static var folder: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return support.appendingPathComponent("Grok Bot Wallpaper", isDirectory: true)
    }

    private static let fill: [NSWorkspace.DesktopImageOptionKey: Any] = [
        .imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue,
        .allowClipping: true,
    ]

    /// Snapshots this display's page and makes it the display's desktop picture.
    func update(_ screen: NSScreen, id: CGDirectDisplayID, from webView: WKWebView) {
        let config = WKSnapshotConfiguration()
        config.snapshotWidth = NSNumber(value: Double(screen.frame.width))   // 1 px per point is plenty for a tint
        webView.takeSnapshot(with: config) { [weak self] image, _ in
            guard let self, let image else { return }
            self.apply(image, to: screen, id: id)
        }
    }

    /// A Space switch can show that Space's own picture: put the latest snapshot back, without a new snapshot.
    func reapply(_ screens: [(NSScreen, CGDirectDisplayID)]) {
        for (screen, id) in screens {
            guard let file = latest[id] else { continue }
            let current = NSWorkspace.shared.desktopImageURL(for: screen)
            if current == file { continue }
            remember(current, for: id)
            try? NSWorkspace.shared.setDesktopImageURL(file, for: screen, options: DesktopMatcher.fill)
        }
    }

    /// Gives every display its own picture back, unless the user picked a new one meanwhile.
    func restore(_ screens: [(NSScreen, CGDirectDisplayID)]) {
        for (screen, id) in screens {
            guard let original = Settings.originalDesktop(for: id) else { continue }
            if let current = NSWorkspace.shared.desktopImageURL(for: screen), DesktopMatcher.isOurs(current) {
                try? NSWorkspace.shared.setDesktopImageURL(original, for: screen, options: [:])
            }
            Settings.setOriginalDesktop(nil, for: id)
        }
        latest = [:]
    }

    private func apply(_ image: NSImage, to screen: NSScreen, id: CGDirectDisplayID) {
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
              let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) else { return }
        let current = NSWorkspace.shared.desktopImageURL(for: screen)
        remember(current, for: id)
        // macOS keeps showing a picture whose file name did not change: alternate between two names
        let index = current?.lastPathComponent == "desktop-\(id)-0.png" ? 1 : 0
        let file = DesktopMatcher.folder.appendingPathComponent("desktop-\(id)-\(index).png")
        do {
            try FileManager.default.createDirectory(at: DesktopMatcher.folder, withIntermediateDirectories: true)
            try png.write(to: file, options: .atomic)
            try NSWorkspace.shared.setDesktopImageURL(file, for: screen, options: DesktopMatcher.fill)
            latest[id] = file
        } catch {
            NSLog("Grok Bot Wallpaper: desktop picture not set: %@", error.localizedDescription)
        }
    }

    // The latest picture that is not ours is the user's own: that is the one to give back.
    private func remember(_ current: URL?, for id: CGDirectDisplayID) {
        if let current, !DesktopMatcher.isOurs(current) { Settings.setOriginalDesktop(current, for: id) }
    }

    private static func isOurs(_ url: URL) -> Bool {
        url.standardizedFileURL.path.hasPrefix(folder.standardizedFileURL.path)
    }
}
