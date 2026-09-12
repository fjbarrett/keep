import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import ReactMarkdown from "react-markdown";
import { remarkCitationReferences } from "@/lib/remarkCitationReferences";

afterEach(cleanup);

it("renders source-only citation tags as accessible superscript references", () => {
  const { container } = render(
    <ReactMarkdown remarkPlugins={[remarkCitationReferences]}>
      {'Daktronics systems.<citation src="1,5"></citation>'}
    </ReactMarkdown>,
  );

  const reference = container.querySelector("sup.citation-reference");
  expect(container.textContent).toBe("Daktronics systems.[1, 5]");
  expect(reference?.textContent).toBe("[1, 5]");
  expect(reference?.getAttribute("aria-label")).toBe("Sources 1, 5");
  expect(reference?.getAttribute("title")).toBe("Sources 1, 5");
});

it("leaves citation tag examples inside code unchanged", () => {
  const { container } = render(
    <ReactMarkdown remarkPlugins={[remarkCitationReferences]}>
      {'`<citation src="2"></citation>`\n\n```html\n<citation src="3"></citation>\n```'}
    </ReactMarkdown>,
  );

  expect(container.querySelector("sup")).toBeNull();
  expect(container.querySelector("code")?.textContent).toBe(
    '<citation src="2"></citation>',
  );
  expect(container.querySelector("pre code")?.textContent).toBe(
    '<citation src="3"></citation>\n',
  );
});
