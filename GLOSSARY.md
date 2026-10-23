# Infinite Workspace

A local-first, pannable and zoomable board where every card is live HTML rather than a painted approximation. The context exists to prove that canvas composition and native document affordances can coexist.

## Language

**Board**:
The complete saved collection of cards, their positions, z-order, and the camera; the user's workspace.
_Avoid_: Canvas, document, page

**Card**:
One note on the board, with a title, body, optional checklist, tag, color, and world-space position.
_Avoid_: Node, tile, sticky, widget

**Node**:
Implementation shorthand for a card when discussing collections and traversals. Prefer **card** in user-facing copy and documentation.
_Avoid_: Object

**Camera**:
The viewport's position in world space and its zoom factor. The camera is not a card and is not part of the board content.
_Avoid_: Viewport, transform, scroll

**Viewport**:
The visible screen rectangle that the camera looks through.
_Avoid_: Screen, window, canvas

**World space**:
The unbounded coordinate system in which cards have positions.
_Avoid_: Board space, canvas space

**Screen space**:
CSS-pixel coordinates relative to the viewport, after applying the camera.
_Avoid_: Client space, page space

**Renderer**:
The strategy that turns the board and camera into visible, interactive cards. There are two: the canvas renderer and the DOM renderer.
_Avoid_: Painter, engine, view

**Canvas renderer**:
The primary renderer. Cards are real children of a `<canvas content="drawable">` and are drawn with `drawElementImage()`; the browser keeps their DOM geometry aligned with the drawing.
_Avoid_: WebGL mode, HTML-in-canvas mode, experimental mode

**DOM renderer**:
The fallback renderer. Cards are positioned DOM elements inside a CSS-transformed world layer. It has feature parity with the canvas renderer.
_Avoid_: Fallback mode, legacy mode, plain mode

**Card chrome**:
The non-text parts of a card: its drag strip, tag, color field, selection ring, and optional actions. Chrome can be dragged or selected; card text is for editing.
_Avoid_: Header, frame, shell

**Drag strip**:
The top area of a card whose pointer drag moves the card in world space.
_Avoid_: Handle, grip, header

**Text session**:
The period between focusing and blurring one editable field on a card. A text session coalesces into one undo entry.
_Avoid_: Edit, typing session

**Native find**:
The browser's own Ctrl/Cmd+F find-in-page UI. It searches the real card text in the DOM, not pixels. Infinite Workspace does not provide a custom find UI.
_Avoid_: Search, finder, find bar

**Reveal**:
Moving the camera so a card containing a native-find match is visible. Reveal is a camera action, not a board mutation.
_Avoid_: Scroll to, focus, jump

**Render mode**:
Which renderer is active: `auto`, `canvas`, or `dom`. `auto` selects the canvas renderer when the browser exposes the HTML-in-Canvas APIs, otherwise the DOM renderer.
_Avoid_: Theme, layout mode

**Seed**:
The curated 216-card board loaded when no saved board exists, and restored by "Reset demo".
_Avoid_: Demo data, fixture, sample
