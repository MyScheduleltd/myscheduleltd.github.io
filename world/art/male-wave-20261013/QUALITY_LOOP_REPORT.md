# Shoulder weight validation

Preserved baseline: source GLB at commit c53f6f8 and the inspected Blender scene. Failure: chest and rib skin followed the waving upper arm. The baseline torso guard fails; the corrected asset passes.

The first position-only candidates were rejected because their boundary cut medial arm skin and their neighbouring spinal assignments were inconsistent during action clips. The final method uses a welded surface graph, disconnected lower torso/arm components as anchors, harmonic shoulder influence, and smooth spinal coordinates. This uses mesh adjacency and skin-weight methods already available in the Blender modeling workflow; no external skill publication or dependency installation was needed.

Relative edge stretch alone was an unsuitable acceptance criterion for tiny, irregular triangles on this generated mesh. Final gates measure actual torso displacement, coincidence of UV/normal seam positions during skinning, preservation of asset buffers and joint binds, existing elbow/wrist/garment checks, and rendered pose/contact-sheet review. No lighting or texture change conceals deformation.

Native geometry, all other accessors and image bytes are preserved. There is no animation handler or Blender-only modifier required at runtime. The exported GLB weights drive the actual web application.
