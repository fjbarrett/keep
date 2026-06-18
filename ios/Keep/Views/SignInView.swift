import SwiftUI

/// Native sign-in form (no web view). Collects email + password and hands them
/// to `NotesStore.signIn`, which establishes the session via `AuthClient`.
/// Google/passkey aren't offered here yet — email + password is the native path.
struct SignInView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var submitting = false

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
                    .disabled(submitting || email.isEmpty || password.isEmpty)
                }
            }
            .navigationTitle("Sign in to Keep")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
    }

    private func submit() async {
        guard !submitting, !email.isEmpty, !password.isEmpty else { return }
        submitting = true
        defer { submitting = false }
        error = await store.signIn(email: email, password: password)
        if error == nil { dismiss() }
    }
}
