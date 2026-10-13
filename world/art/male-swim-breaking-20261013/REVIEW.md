# Male swimwear and Breaking hand review — 2026-10-13

The owner confirmed black swim shorts with white stripes, and identified wrong dance palm directions and wrists that did not turn. His saved swimsuit dye is now ignored for this fixed design; the native texture and side stripes remain. Other dye slots and female swimwear retain their existing behaviour.

Blender MCP inspected the original Northern Soul floor-combo FBX. The animation previously inherited the forearm alignment for each hand, missing the generated male's actual palm roll and the source wrist rest bend. Source T-pose hand frames now map the male's inspected palm/finger frame onto the animation. The forearm carries its reference roll as well, avoiding a concentrated wrist twist. Body geometry, all existing motion samples, punch mapping and female mapping are unchanged.

Verification: TypeScript/Vite build and 436/436 tests pass, including the subsequent shorts-hem repair. All 254 source frames agree with the retargeted hand directions; native wrists articulate relative to the forearms, wrist skin retains volume, and both support palms face down in sampled floor phases. Reviewed nine rendered dance frames plus enlarged floor wrists. The initial saved-magenta swimwear check missed the lower fabric being labelled as skin; the [hem repair](../male-shorts-hem-20261013/REVIEW.md) supersedes that check. Male GLB skin-mask values changed in that follow-up; all geometry, rigging and texture bytes remain preserved. Female remains unchanged. Physical webcam/headset/controller checks were not part of this fix.

Release branch: `codex/male-swim-breaking-20261013`. Owner authorized publication; verified BETA/PS2 packages are prepared for the protected-main PR.

- [Corrected full shorts with saved magenta dye](../male-shorts-hem-20261013/final-front.png)
- [Floor hand close-up](floor-hands.png)
- [Dance contact sheet](contact.png)
- [Verification](verification.json)

Local review: `http://127.0.0.1:4173/avatar-review.html?sex=male&outfit=1&pose=dance&t=7.8&angle=0.6&zoom=1.2&look=1.5&check=breaking-hand-fix` . Play motion runs the full routine.
