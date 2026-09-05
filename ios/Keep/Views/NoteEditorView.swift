import SwiftUI

/// Autosaving editor. A new note (`note == nil`) is created on first save and
/// then patched, mirroring the web app's create→edit bridge.
struct NoteEditorView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AppStorage("readingMeasure") private var comfortableWidth = false
    private enum Field { case title, body }
    @FocusState private var isTitleFocused: Bool
    @State private var isBodyFocused = false
    private var focusedField: Field? { isTitleFocused ? .title : isBodyFocused ? .body : nil }

    let note: Note?
    @State private var body_: String
    @State private var title: String
    @State private var isColorPickerPresented = false
    @State private var headerHeight: CGFloat = 44
    @State private var titleScrollOffset: CGFloat = 0
    @State private var draftID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    private var id: String { note?.id ?? draftID }
    private var selectedColor: String? { (store.visibleNotes.first { $0.id == id } ?? note)?.color }

    init(note: Note?, draft: NoteDraft? = nil) {
        self.note = note
        // Lay out the final text before the first frame of the card expansion.
        _body_ = State(initialValue: draft?.body ?? note?.body ?? "")
        _title = State(initialValue: draft?.title ?? note?.title ?? "")
    }

    var body: some View {
        bodyEditor
        .overlay(alignment: .top) {
            editorHeader
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }
                .frame(maxWidth: comfortableWidth ? 620 : .infinity, alignment: .leading)
                .frame(maxWidth: .infinity)
                .padding(.leading, 30)
                .padding(.trailing, 8)
                .padding(.top, 8)
        }
        .overlay(alignment: .bottomTrailing) {
            floatingColorButton
                .padding(.trailing, 8)
                .padding(.bottom, 8)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if store.drafts.errors[id] != nil {
                DraftSaveStatus(id: id, horizontalPadding: 16) { _ in dismiss() }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            }
        }
        .background {
            Rectangle().fill(.regularMaterial)
                .overlay {
                    if colorScheme == .dark {
                        Color.black.opacity(0.64)
                    }
                }
                .ignoresSafeArea()
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if note == nil {
                await Task.yield()
                guard !Task.isCancelled else { return }
                isTitleFocused = true
            }
        }
        .onDisappear { store.drafts.start(id) }
        .onChange(of: isTitleFocused) { _, focused in
            if focused { isBodyFocused = false }
        }
        .onChange(of: isBodyFocused) { _, focused in
            if focused { isTitleFocused = false }
        }
        .onChange(of: store.notes.first { $0.id == id }?.body) { _, body in
            if store.drafts.items[id] == nil, let body { body_ = body }
        }
        .onChange(of: store.notes.first { $0.id == id }?.title) { _, savedTitle in
            if store.drafts.items[id] == nil, let savedTitle { title = savedTitle }
        }
    }

    private var bodyEditor: some View {
        NoteBodyTextView(text: Binding(get: { body_ }, set: { value in
            guard value != body_ else { return }
            body_ = value
            stageDraft()
        }), isFocused: $isBodyFocused, topInset: headerHeight + 24, titleScrollOffset: $titleScrollOffset)
            .padding(.horizontal, 26)
            .frame(maxWidth: comfortableWidth ? 620 : .infinity)
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Note body")
            .accessibilityHint("Edit or add text. Changes save automatically.")
            .disabled(!store.canEdit)
    }

    private var editorHeader: some View {
        Group {
            if isCompactWriting {
                closeButton.frame(maxWidth: .infinity, alignment: .trailing)
            } else if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    HStack { Spacer(); closeButton }
                    floatingTitle
                }
            } else {
                HStack(spacing: 4) {
                    floatingTitle.frame(maxWidth: .infinity, alignment: .leading)
                    closeButton
                }
            }
        }
    }

    private var titleVisibility: CGFloat {
        if focusedField == .title { return 1 }
        return 1 - titleScrollOffset / 32
    }

    private var floatingTitle: some View {
        titleField
            .opacity(titleVisibility)
            .offset(y: -24 * (1 - titleVisibility))
            .allowsHitTesting(titleVisibility > 0)
            .accessibilityHidden(titleVisibility == 0)
    }

    @ViewBuilder private var closeButton: some View {
        if #available(iOS 26, *) {
            Button(role: .close) { dismiss() }
                .labelStyle(.iconOnly)
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .accessibilityLabel("Close note")
        } else {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .tint(.primary)
            .background(.ultraThinMaterial, in: Circle())
            .accessibilityLabel("Close note")
        }
    }

    @ViewBuilder private var floatingColorButton: some View {
        if #available(iOS 26, *) {
            colorButton.glassEffect(.regular.interactive(), in: .circle)
        } else {
            colorButton.background(.ultraThinMaterial, in: Circle())
        }
    }

    private var colorButton: some View {
        Button { isColorPickerPresented = true } label: {
            colorMenuLabel(for: selectedColor)
                .resizable()
                .scaledToFit()
                .frame(width: 20, height: 20)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .tint(.primary)
        .accessibilityLabel("Note color")
        .accessibilityValue(NotePalette.all.first { $0.key == selectedColor }?.label ?? "None")
        .disabled(!store.canEdit)
        .popover(isPresented: $isColorPickerPresented) {
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(44), spacing: 8), count: 3), spacing: 8) {
                colorOption(nil)
                ForEach(NotePalette.all, id: \.key) { option in
                    colorOption(option.key)
                }
            }
            .padding(12)
            .presentationCompactAdaptation(.popover)
        }
    }

    private var isCompactWriting: Bool {
        focusedField == .body && (verticalSizeClass == .compact || dynamicTypeSize.isAccessibilitySize)
    }

    private var titleLineLimit: Int {
        verticalSizeClass == .compact || focusedField == .body
            || (dynamicTypeSize.isAccessibilitySize && focusedField == .title) ? 1 : 3
    }

    private var titleField: some View {
        TextField("Title", text: Binding(get: { title }, set: { value in
            guard value != title else { return }
            title = value
            stageDraft()
        }), prompt: Text("Title").foregroundStyle(.secondary), axis: .vertical)
            .font(.title2.weight(.semibold))
            .textFieldStyle(.plain)
            .autocorrectionDisabled()
            .keyboardType(.asciiCapable)
            .lineLimit(1...titleLineLimit)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 4)
            .focused($isTitleFocused)
            .submitLabel(.next)
            .onSubmit {
                isTitleFocused = false
                isBodyFocused = true
            }
            .accessibilityLabel("Note title")
            .disabled(!store.canEdit)
    }

    private func colorMenuLabel(for key: String?) -> Image {
        key.map { NotePalette.swatch(for: $0, scheme: colorScheme) }
            ?? Image(systemName: "circle")
    }

    private func colorOption(_ key: String?) -> some View {
        Button {
            isColorPickerPresented = false
            guard key != selectedColor else { return }
            stageDraft(color: key ?? "")
        } label: {
            ZStack {
                Group {
                    if let key {
                        Circle().fill(NotePalette.color(for: key) ?? .gray)
                    } else {
                        Image(systemName: "circle.slash").font(.system(size: 28))
                    }
                }
                .frame(width: 28, height: 28)
                if selectedColor == key {
                    Circle()
                        .strokeBorder(.primary, lineWidth: 2)
                        .frame(width: 38, height: 38)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!store.canEdit)
        .accessibilityLabel(NotePalette.all.first { $0.key == key }?.label ?? "None")
        .accessibilityAddTraits(selectedColor == key ? .isSelected : [])
    }

    private func stageDraft(color: String? = nil) {
        store.drafts.stage(id: id, body: body_, base: store.notes.first { $0.id == id }, title: title, color: color)
    }

}
