import SwiftUI

/// Native sign-in. Collects email + password (handed to `NotesStore.signIn`,
/// which establishes the session via `AuthClient`) and offers Google sign-in
/// through the system browser (`NotesStore.signInWithGoogle`). Passkeys aren't
/// offered in the native flow yet.
struct SignInView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var googleError: String?
    @State private var submitting = false
    @State private var googleSubmitting = false

    private var busy: Bool { submitting || googleSubmitting }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        #endif
                        .autocorrectionDisabled()
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .onSubmit { Task { await submit() } }
                } footer: {
                    if let error {
                        Text(error).foregroundStyle(.red)
                    }
                }

                Section {
                    Button(action: { Task { await submit() } }) {
                        HStack {
                            if submitting { ProgressView() }
                            Text("Sign in").fontWeight(.medium)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(busy || email.isEmpty || password.isEmpty)
                }

                Section {
                    Button(action: { Task { await googleSignIn() } }) {
                        HStack(spacing: 8) {
                            if googleSubmitting {
                                ProgressView()
                            } else {
                                GoogleGlyph().frame(width: 16, height: 16)
                            }
                            Text("Continue with Google").fontWeight(.medium)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(busy)
                } header: {
                    Text("or")
                } footer: {
                    if let googleError {
                        Text(googleError).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Sign in to Keep")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
    }

    private func submit() async {
        guard !busy, !email.isEmpty, !password.isEmpty else { return }
        submitting = true
        defer { submitting = false }
        error = await store.signIn(email: email, password: password)
        if error == nil { dismiss() }
    }

    private func googleSignIn() async {
        guard !busy else { return }
        googleSubmitting = true
        defer { googleSubmitting = false }
        googleError = await store.signInWithGoogle()
        if googleError == nil && !store.needsAuth { dismiss() }
    }
}

/// A Google-blue "G" mark on the sign-in button. Kept to a single brand color
/// for now; the full four-color wordmark (as on the web) is a polish follow-up.
/// The four-color Google "G": a ring split into the brand's blue/green/yellow/
/// red arcs with a blue crossbar, drawn so the button matches the web sign-in.
private struct GoogleGlyph: View {
    private static let blue = Color(red: 0.259, green: 0.522, blue: 0.957)
    private static let green = Color(red: 0.204, green: 0.659, blue: 0.325)
    private static let yellow = Color(red: 0.984, green: 0.737, blue: 0.020)
    private static let red = Color(red: 0.918, green: 0.263, blue: 0.208)

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height)
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let stroke = s * 0.26
            let radius = (s - stroke) / 2

            func arc(_ from: Double, _ to: Double, _ color: Color) {
                var p = Path()
                p.addArc(center: center, radius: radius,
                         startAngle: .degrees(from), endAngle: .degrees(to),
                         clockwise: false)
                ctx.stroke(p, with: .color(color),
                           style: StrokeStyle(lineWidth: stroke, lineCap: .butt))
            }

            arc(17, 158, Self.green)    // bottom
            arc(158, 202, Self.yellow)  // left
            arc(202, 270, Self.red)     // top-left → top
            arc(270, 343, Self.blue)    // top-right down toward the crossbar gap

            // Blue crossbar from the center out to the right edge, with a rounded
            // outer end so it reads as the G's bar rather than a plain rectangle.
            let bar = CGRect(x: center.x - stroke * 0.1, y: center.y - stroke / 2,
                             width: radius + stroke * 0.6, height: stroke)
            ctx.fill(Path(roundedRect: bar, cornerRadius: stroke * 0.18), with: .color(Self.blue))
        }
    }
}
