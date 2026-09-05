import SwiftUI

struct ReadingSettings: View {
    @AppStorage("readingTextSize") private var textSize = 0
    @AppStorage("readingLineSpacing") private var lineSpacing = 0.0
    @AppStorage("readingMeasure") private var comfortableWidth = false

    var body: some View {
        Form {
            Section("Reading and editing") {
                Picker("Text size", selection: $textSize) {
                    Text("System default").fixedSize(horizontal: false, vertical: true).tag(0)
                    Text("Large").fixedSize(horizontal: false, vertical: true).tag(1)
                    Text("Extra large").fixedSize(horizontal: false, vertical: true).tag(2)
                }
                #if os(iOS)
                .pickerStyle(.inline)
                #endif
                VStack(alignment: .leading) {
                    Text("Extra line spacing: \(Int(lineSpacing)) points")
                    Slider(value: $lineSpacing, in: 0...16, step: 2) {
                        Text("Extra line spacing")
                    }
                }
                Toggle("Comfortable reading width", isOn: $comfortableWidth)
                Text("Text continues to follow your system accessibility settings.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Preview") {
                Text("Your notes, at a size and spacing that work for you.")
                    .modifier(ReadingStyle())
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Reading settings")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

struct ReadingStyle: ViewModifier {
    var constrainWidth = true
    @AppStorage("readingTextSize") private var textSize = 0
    @AppStorage("readingLineSpacing") private var lineSpacing = 0.0
    @AppStorage("readingMeasure") private var comfortableWidth = false

    func body(content: Content) -> some View {
        content
            .font(textSize == 2 ? .title2 : textSize == 1 ? .title3 : .body)
            .lineSpacing(lineSpacing)
            .frame(maxWidth: constrainWidth && comfortableWidth ? 680 : .infinity, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
    }
}
