import { useLayoutEffect, useRef, type ReactNode } from "react";
import { pageTablePolicies } from "./page-table-policies";

/** Adjacent React text nodes form one line (for example batch + quantity).
 * Measuring nodes independently underestimates that line's protected width. */
function protectedTextWidth(cell: HTMLTableCellElement, skipReveals = false) {
  const lines: { top: number; left: number; right: number }[] = [];
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim() || walker.currentNode.parentElement?.closest(skipReveals ? "select, .modal-table-value" : "select")) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      const line = lines.find(line => Math.abs(line.top - rect.top) < 3);
      if (line) { line.left = Math.min(line.left, rect.left); line.right = Math.max(line.right, rect.right); }
      else lines.push({ top: rect.top, left: rect.left, right: rect.right });
    }
  }
  return Math.max(0, ...lines.map(line => line.right - line.left));
}

/** Header text, protected values and real controls establish the minimum; spare
 * space is distributed by content role. No column-position percentage budgets. */
function sizePageColumns(table: HTMLTableElement, available: number) {
  const headers = [...table.tHead!.rows[0].cells];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const minimums = headers.map((header, index) => {
    const style = getComputedStyle(header);
    context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const label = header.textContent!.trim();
    const text = style.textTransform === "uppercase" ? label.toUpperCase() : label;
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const heading = context.measureText(text).width + (parseFloat(style.letterSpacing) || 0) * Math.max(0, text.length - 1);
    let content = 0;
    if (header.hasAttribute("data-page-flex")) {
      const bodyStyle = getComputedStyle(table.tBodies[0]?.rows[0]?.cells[index] ?? header);
      context.font = bodyStyle.font || `${bodyStyle.fontWeight} ${bodyStyle.fontSize} ${bodyStyle.fontFamily}`;
      content = context.measureText("0").width * Number(header.dataset.pageCharacters ?? 16);
      if (!header.hasAttribute("data-page-wrap")) {
        for (const body of table.tBodies) for (const row of body.rows) {
          if (row.cells.length === headers.length) content = Math.max(content, protectedTextWidth(row.cells[index], true));
        }
      }
    } else {
      for (const body of table.tBodies) for (const row of body.rows) {
        if (row.cells.length !== headers.length) continue;
        const cell = row.cells[index];
        for (const select of cell.querySelectorAll<HTMLSelectElement>("select")) {
          const controlStyle = getComputedStyle(select);
          context.font = controlStyle.font || `${controlStyle.fontWeight} ${controlStyle.fontSize} ${controlStyle.fontFamily}`;
          const optionWidth = Math.max(0, ...[...select.options].map(option => context.measureText(option.text).width));
          select.style.minWidth = Math.ceil(optionWidth + parseFloat(controlStyle.paddingLeft) + parseFloat(controlStyle.paddingRight) + parseFloat(controlStyle.borderLeftWidth) + parseFloat(controlStyle.borderRightWidth) + 24) + "px";
        }
        content = Math.max(content, protectedTextWidth(cell));
        for (const control of cell.querySelectorAll<HTMLElement>("button, select, input, .table-actions")) content = Math.max(content, control.getBoundingClientRect().width);
        for (const group of cell.querySelectorAll<HTMLElement>("div, span")) {
          if (getComputedStyle(group).display === "inline-flex") content = Math.max(content, group.getBoundingClientRect().width);
        }
      }
    }
    return Math.ceil(Math.max(heading, content) + padding + 8);
  });
  const minimum = minimums.reduce((sum, value) => sum + value, 0);
  // Spare room belongs to identifying text, not actions, dates or amounts.
  const weights = headers.map(header => Number(header.dataset.pageWeight ?? 0));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const width = Math.max(minimum, available);
  table.style.setProperty("--page-table-min", minimum + "px");
  headers.forEach((header, index) => {
    const allocation = minimums[index] + (width - minimum) * (totalWeight ? weights[index] / totalWeight : 1 / headers.length);
    header.style.setProperty("--page-column-width", allocation / width * 100 + "%");
  });
}

/** Opt-in page layout enhancement. It never owns rows, permissions or data.
 * Only the inert visual header is cloned; original table semantics and controls remain intact. */
export function PageTableBoundary({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = root.current!;
    type Entry = { table: HTMLTableElement; frame: HTMLElement; section: HTMLElement; toolbar: HTMLElement | null; mirror: HTMLDivElement; native: boolean };
    const entries = new Map<HTMLTableElement, Entry>();
    let frameId = 0;
    let dirty = true;
    let disposed = false;
    const schedule = () => { if (!frameId) frameId = requestAnimationFrame(update); };
    const resize = new ResizeObserver(() => { dirty = true; schedule(); });
    function discover() {
      const tables = [...host.querySelectorAll<HTMLTableElement>("table[data-page-table]")].filter(table => !table.closest(".modal, [role=dialog]"));
      for (const [table, entry] of entries) if (!tables.includes(table)) {
        resize.unobserve(table); resize.unobserve(entry.frame); if (entry.toolbar) resize.unobserve(entry.toolbar);
        for (const attribute of ["data-page-scroll", "data-page-fit", "data-page-native", "data-page-cart", "data-page-scroll-host", "role", "tabindex", "aria-label"]) entry.frame.removeAttribute(attribute);
        entry.mirror.remove(); entries.delete(table);
      }
      for (const table of tables) {
        const frame = table.closest<HTMLElement>(".page-table-inner-scroll, .table-scroll");
        const section = table.closest<HTMLElement>("section.surface-card");
        if (!frame || !section) continue;
        const config = pageTablePolicies[table.dataset.pageTable ?? ""];
        if (!config || !table.tHead?.rows[0]) continue;
        table.dataset.pageKind = config.kind ?? "records";
        table.setAttribute("aria-label", config.label);
        [...table.tHead.rows[0].cells].forEach((header, index) => {
          const column = config.columns[index] ?? {};
          const cells = [header, ...[...table.tBodies].flatMap(body => [...body.rows].map(row => row.cells.length === table.tHead!.rows[0].cells.length ? row.cells[index] : null))];
          header.setAttribute("scope", "col");
          header.dataset.pageWeight = String(column.flexible ?? 0);
          header.dataset.pageCharacters = String(column.characters ?? 16);
          for (const cell of cells) if (cell) {
            cell.toggleAttribute("data-page-number", !!column.numeric);
            cell.setAttribute("data-page-align", column.align ?? "left");
            cell.toggleAttribute("data-page-wrap", !!column.wrap);
            cell.toggleAttribute("data-page-flex", !!column.flexible);
          }
        });
        if (entries.has(table)) continue;
        frame.dataset.pageScroll = "true";
        frame.tabIndex = 0;
        frame.setAttribute("role", "region");
        frame.setAttribute("aria-label", config.label + ", scroll horizontally for more columns when needed");
        section.dataset.pageSection = "true";
        const toolbar = section.querySelector<HTMLElement>(".table-tools") ?? (config.separateToolbar ? section.firstElementChild as HTMLElement : null);
        if (toolbar) toolbar.dataset.pageToolbar = "true";
        const attachedToolbar = !!toolbar && section.classList.contains("table-card");
        frame.toggleAttribute("data-page-with-toolbar", attachedToolbar);
        if (frame.classList.contains("page-table-inner-scroll")) {
          const outer = frame.parentElement!;
          for (const attribute of ["data-page-scroll", "data-page-fit", "data-page-native", "role", "tabindex", "aria-label"]) outer.removeAttribute(attribute);
          outer.dataset.pageScrollHost = "true";
        } else delete frame.dataset.pageScrollHost;
        const mirror = document.createElement("div");
        mirror.className = "page-tables page-table-sticky";
        mirror.toggleAttribute("data-page-with-toolbar", attachedToolbar);
        mirror.setAttribute("aria-hidden", "true");
        mirror.inert = true;
        mirror.hidden = true;
        document.body.append(mirror);
        entries.set(table, { table, frame, section, toolbar, mirror, native: false });
        resize.observe(frame); resize.observe(table); if (toolbar) resize.observe(toolbar);
      }
      // React can replace a tab's table between animation frames. Deferring its
      // first measurement paints equal/stale columns for one frame. Mutation
      // observers and this layout effect both run before paint, so finish the
      // new table's annotations, sizing and sticky state in the same turn.
      if (frameId) cancelAnimationFrame(frameId);
      dirty = true; update();
    }
    function update() {
      frameId = 0;
      for (const entry of entries.values()) {
        const { table, frame, section, toolbar, mirror } = entry;
        if (dirty) sizePageColumns(table, frame.clientWidth);
        const cart = pageTablePolicies[table.dataset.pageTable ?? ""]?.localScroll;
        // Existing cart scroll ownership is retained; every other table follows the document.
        const toolbarHeight = toolbar?.getBoundingClientRect().height ?? 0;
        const tall = table.getBoundingClientRect().height > innerHeight - toolbarHeight - 48;
        const pinTools = !!toolbar && tall && innerWidth > 760 && toolbarHeight + 48 < innerHeight * .25;
        toolbar?.toggleAttribute("data-page-pin", pinTools);
        section.style.setProperty("--page-toolbar-height", pinTools ? toolbarHeight + "px" : "0px");
        const fits = table.getBoundingClientRect().width <= frame.clientWidth + 1;
        frame.tabIndex = !fits || !!cart ? 0 : -1;
        entry.native = fits || !!cart;
        frame.toggleAttribute("data-page-fit", fits && !cart);
        frame.toggleAttribute("data-page-native", entry.native);
        frame.toggleAttribute("data-page-cart", !!cart);
        const tableBounds = table.getBoundingClientRect();
        const headerHeight = table.tHead!.getBoundingClientRect().height;
        const needsSticky = !!cart || tableBounds.height > innerHeight - (pinTools ? toolbarHeight : 0) - 24;
        frame.toggleAttribute("data-page-sticky", needsSticky);
        if (toolbar) toolbar.style.transform = pinTools ? "translateY(" + Math.min(0, tableBounds.bottom - headerHeight - toolbarHeight) + "px)" : "";
        if (entry.native) { mirror.hidden = true; continue; }
        const bounds = frame.getBoundingClientRect();
        const top = Math.min(pinTools ? toolbarHeight : 0, tableBounds.bottom - headerHeight);
        const active = needsSticky && tableBounds.top < top && tableBounds.bottom > 0 && bounds.right > 0 && bounds.left < innerWidth;
        mirror.hidden = !active || !!document.querySelector(".modal-backdrop, [role=dialog]");
        if (!active) continue;
        if (dirty || !mirror.firstChild) {
          const visualTable = document.createElement("table");
          visualTable.className = "data-table";
          visualTable.dataset.pageTable = "true";
          const head = table.tHead!.cloneNode(true) as HTMLTableSectionElement;
          head.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
          head.querySelectorAll<HTMLElement>("button, a, input, select, [tabindex]").forEach(node => node.tabIndex = -1);
          [...head.rows[0].cells].forEach((cell, i) => cell.style.setProperty("width", table.tHead!.rows[0].cells[i].getBoundingClientRect().width + "px", "important"));
          visualTable.append(head);
          mirror.replaceChildren(visualTable);
        }
        Object.assign(mirror.style, { left: bounds.left + "px", top: top + "px", width: bounds.width + "px", height: headerHeight + "px" });
        const frameStyle = getComputedStyle(frame);
        mirror.style.borderTopLeftRadius = frameStyle.borderTopLeftRadius;
        mirror.style.borderTopRightRadius = frameStyle.borderTopRightRadius;
        const visual = mirror.firstElementChild as HTMLElement;
        visual.style.width = tableBounds.width + "px";
        visual.style.transform = "translateX(" + -frame.scrollLeft + "px)";
      }
      dirty = false;
    }
    const mutations = new MutationObserver(discover);
    mutations.observe(host, { childList: true, subtree: true, characterData: true });
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const fontsChanged = () => { if (!disposed) { dirty = true; schedule(); } };
    void document.fonts.ready.then(fontsChanged);
    document.fonts.addEventListener("loadingdone", fontsChanged);
    discover();
    return () => {
      disposed = true;
      mutations.disconnect(); resize.disconnect(); cancelAnimationFrame(frameId);
      document.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule);
      document.fonts.removeEventListener("loadingdone", fontsChanged);
      entries.forEach(entry => entry.mirror.remove());
    };
  }, []);
  return <div ref={root} className="page-tables">{children}</div>;
}
