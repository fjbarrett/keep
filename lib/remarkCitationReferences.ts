type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
};

const openingCitation = /^<citation\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>$/i;
const closingCitation = /^<\/citation\s*>$/i;

function citationReference(sourceList: string): MarkdownNode | null {
  const sources = sourceList
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
  if (sources.length === 0) return null;

  const sourceLabel = `${sources.length === 1 ? "Source" : "Sources"} ${sources.join(", ")}`;
  return {
    type: "emphasis",
    data: {
      hName: "sup",
      hProperties: {
        ariaLabel: sourceLabel,
        className: ["citation-reference"],
        title: sourceLabel,
      },
    },
    children: [{ type: "text", value: `[${sources.join(", ")}]` }],
  };
}

/** Render source-only citation tags without enabling arbitrary inline HTML. */
export function remarkCitationReferences() {
  return (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (!node.children) return;

      const children: MarkdownNode[] = [];
      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        const closing = node.children[index + 1];
        const match = child.type === "html" ? child.value?.match(openingCitation) : null;
        const reference = match ? citationReference(match[2]) : null;

        if (
          reference &&
          closing?.type === "html" &&
          closingCitation.test(closing.value ?? "")
        ) {
          children.push(reference);
          index += 1;
          continue;
        }

        walk(child);
        children.push(child);
      }
      node.children = children;
    };

    walk(tree);
  };
}
