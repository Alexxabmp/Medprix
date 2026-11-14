import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type CSSProperties,
} from "react";
import {
  ModalTableLayout,
  ModalTableBody,
  ModalTableFooter,
  ModalTableFrame,
  ModalTablePager,
  ModalTableValue,
  useModalTableRows,
} from "./modal-table-layout";

type Element = ReactElement<Record<string, any>>;
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement(child)
          ? text((child as Element).props.children)
          : "",
    )
    .join(" ")
    .trim();
}
function labelHeading(node: ReactNode, id: string): ReactNode {
  return Children.map(node, (child) =>
    !isValidElement(child)
      ? child
      : child.type === "h2"
        ? cloneElement(child as Element, { id })
        : typeof child.type === "string" && (child as Element).props.children
          ? cloneElement(
              child as Element,
              {},
              labelHeading((child as Element).props.children, id),
            )
          : child,
  );
}

/** Used only by existing inline table dialogs, never by page tables. */
export function ModalTableDialog({
  children,
  close,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { close: () => void }) {
  const id = useId();
  const all = Children.toArray(children);
  const header = all.find(
    (child) =>
      isValidElement(child) &&
      (child as Element).props.className?.split(" ").includes("modal-header"),
  );
  const actions = all.filter(
    (child) =>
      isValidElement(child) &&
      (child as Element).props.className?.split(" ").includes("modal-actions"),
  );
  return (
    <div
      {...props}
      className={`modal modal-table-standard ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
    >
      <ModalTableLayout close={close}>
        {labelHeading(header, id)}
        <ModalTableBody>
          {all.filter((child) => child !== header && !actions.includes(child))}
        </ModalTableBody>
        <ModalTableFooter>{actions}</ModalTableFooter>
      </ModalTableLayout>
    </div>
  );
}

function truncate(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (typeof child === "string" && child.trim())
      return <ModalTableValue value={child} />;
    if (
      !isValidElement(child) ||
      typeof child.type !== "string" ||
      ["button", "a", "input", "select"].includes(child.type)
    )
      return child;
    const element = child as Element;
    const style = { ...element.props.style };
    delete style.maxHeight;
    delete style.overflowY;
    delete style.overflowX;
    return cloneElement(element, { style }, truncate(element.props.children));
  });
}

export function ModalDataTable({
  children,
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  const sections = Children.toArray(children);
  const body = sections.find(
    (child) => isValidElement(child) && child.type === "tbody",
  ) as Element | undefined;
  const head = sections.find(
    (child) => isValidElement(child) && child.type === "thead",
  ) as Element | undefined;
  const headers: string[] = [];
  function collect(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (isValidElement(child)) {
        if (child.type === "th")
          headers.push(text((child as Element).props.children));
        else collect((child as Element).props.children);
      }
    });
  }
  collect(head);
  const rows = Children.toArray(body?.props.children).filter(
    isValidElement,
  ) as Element[];
  const pages = useModalTableRows(rows, rows.map((row) => row.key).join("|"));
  const keyValue = !head;
  const heavy = headers.findIndex((header) =>
    /product|items|notes|supplier|collector/i.test(header),
  );
  const numeric = headers.map((header) =>
    /(quantity|^qty|^stock|reorder|price|cost|subtotal|line total|^total|^amount|balance)/i.test(
      header,
    ),
  );
  let headingIndex = 0;
  function annotateHead(node: ReactNode): ReactNode {
    return Children.map(node, (child) =>
      !isValidElement(child)
        ? child
        : child.type === "th"
          ? cloneElement(child as Element, {
              "data-numeric": numeric[headingIndex++] ? "true" : undefined,
            })
          : cloneElement(
              child as Element,
              {},
              annotateHead((child as Element).props.children),
            ),
    );
  }
  const renderedHead = annotateHead(head);
  const rendered = pages.rows.map((row) =>
    cloneElement(
      row,
      {},
      Children.map(row.props.children, (cell, index) => {
        if (
          !isValidElement(cell) ||
          Number((cell as Element).props.colSpan ?? 1) > 1
        )
          return cell;
        if (index !== heavy)
          return cloneElement(cell as Element, {
            "data-numeric": numeric[index] ? "true" : undefined,
          });
        return cloneElement(
          cell as Element,
          {
            className:
              ((cell as Element).props.className ?? "") +
              " modal-table-text-cell",
          },
          truncate((cell as Element).props.children),
        );
      }),
    ),
  );
  return (
    <>
      <ModalTableFrame>
        <div
          className="modal-table-scroll"
          role="region"
          aria-label="Table, scroll horizontally for more columns"
          tabIndex={0}
        >
          <table
            {...props}
            style={
              {
                ...props.style,
                "--modal-table-min": keyValue
                  ? "0px"
                  : `${headers.length >= 6 ? 900 : headers.length === 5 ? 760 : 640}px`,
              } as CSSProperties
            }
            className={`${className} modal-data-table ${keyValue ? "modal-table-key-value" : ""}`}
            data-modal-table="auto"
          >
            {sections.map((child) =>
              child === body && body
                ? cloneElement(body, {}, rendered)
                : child === head
                  ? renderedHead
                  : child,
            )}
          </table>
        </div>
      </ModalTableFrame>
      <ModalTableFooter>
        <ModalTablePager {...pages} label={headers[0] || "Records"} />
      </ModalTableFooter>
    </>
  );
}
