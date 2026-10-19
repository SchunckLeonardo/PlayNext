# PlayNext — design system

This direction was created with the UI UX Pro Max skill. The initial `gaming discovery dark immersive --design-system` search set the entertainment context, contrast, imagery, and accessibility goals. Since a 3D showcase did not fit the decision flow, a focused `dark entertainment discovery --domain style` search confirmed **Dark Mode (OLED)**. The `dragging movements alternatives --domain ux` search established button and keyboard alternatives.

- Product: discovery and decision-making, with the game as the main focus.
- Colors: background `#111210`, surface `#1A1B18`, text `#F3F2E9`, secondary `#A3A59A`, and orange `#F4A16B`. Green, blue, and red distinguish the three choices, always paired with text and icons.
- Type: Space Grotesk for headings, DM Sans for controls. Editorial hierarchy and prominent game titles.
- Layout: filters, game card, and activity on desktop; vertical flow on mobile; responsive collection grid.
- Motion: short card exit in the direction of the choice. Respects `prefers-reduced-motion`.
- Interaction: pointer events for dragging; equivalent buttons; ← not interested, ↓ played, → want to play; Z undoes.
- Accessibility: semantic HTML, persistent labels, visible focus, native dialogs, live-region announcements, descriptive image text, and larger touch targets on touch devices.
- No invented ratings or social proof. The demo is identified and uses covers, ratings, and IDs checked against RAWG; descriptions are editorial and in English.
