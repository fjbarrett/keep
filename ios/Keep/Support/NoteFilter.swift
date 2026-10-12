import Foundation

/// Shared note filters for the iOS list and Mac sidebar.
enum NoteFilter: String, CaseIterable, Identifiable {
    case all = "All Notes"
    case pinned = "Pinned"
    case archived = "Archived"
    case trash = "Trash"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .all: return "note.text"
        case .pinned: return "pin"
        case .archived: return "archivebox"
        case .trash: return "trash"
        }
    }

    func matches(_ note: Note) -> Bool {
        switch self {
        case .all: return !note.trashed && !note.archived
        case .pinned: return note.pinned && !note.trashed && !note.archived
        case .archived: return note.archived && !note.trashed
        case .trash: return note.trashed
        }
    }

    var emptyTitle: String {
        switch self {
        case .all: return "No notes"
        case .pinned: return "Nothing pinned"
        case .archived: return "Nothing archived"
        case .trash: return "Trash is empty"
        }
    }

    var emptyMessage: String {
        switch self {
        case .all: return "Tap the pencil to write your first note."
        case .pinned: return "Pin a note to keep it at the top of the list."
        case .archived: return "Archived notes are kept out of the main list."
        case .trash: return "Notes you trash land here until you delete them."
        }
    }
}
