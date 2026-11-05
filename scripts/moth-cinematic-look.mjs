// Grade the finished scene before any dialogue, timing rail or other interface.
// Bayer thresholds are fixed in native pixels: no crawling grain, flicker or
// CPU pixel readback. One reusable GPU pass, with a cached Canvas2D fallback.
export function createMothCinematicRenderer() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: true,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: true
  });
  if (!gl) return null;
  const vertex = `
    attribute vec2 aPosition;
    varying vec2 vUV;
    void main() { vUV = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
  `;
  const fragment = `
    precision mediump float;
    uniform sampler2D uImage;
    uniform vec2 uSourceScale;
    uniform vec2 uSize;
    uniform vec3 uShadow;
    uniform vec3 uHighlight;
    uniform vec3 uHaze;
    uniform float uVignette;
    uniform vec4 uPool0;
    uniform vec4 uPool1;
    uniform vec4 uPool2;
    uniform vec4 uColour0;
    uniform vec4 uColour1;
    uniform vec4 uColour2;
    varying vec2 vUV;
    float bayer(vec2 pixel) {
      vec2 p = mod(floor(pixel / 2.), 4.);
      float row0 = p.x < 1. ? 0. : p.x < 2. ? 8. : p.x < 3. ? 2. : 10.;
      float row1 = p.x < 1. ? 12. : p.x < 2. ? 4. : p.x < 3. ? 14. : 6.;
      float row2 = p.x < 1. ? 3. : p.x < 2. ? 11. : p.x < 3. ? 1. : 9.;
      float row3 = p.x < 1. ? 15. : p.x < 2. ? 7. : p.x < 3. ? 13. : 5.;
      return ((p.y < 1. ? row0 : p.y < 2. ? row1 : p.y < 3. ? row2 : row3) + .5) / 16.;
    }
    vec3 pool(vec2 uv, vec4 shape, vec4 colour, vec3 base) {
      vec2 delta = (uv - shape.xy) / max(shape.zw, vec2(.01));
      float falloff = exp(-dot(delta, delta) * 2.);
      // Reflected illumination retains painted shading and skin detail.
      float material = smoothstep(0., .14, dot(base, vec3(.2126, .7152, .0722)));
      return colour.rgb * colour.a * falloff * (vec3(1.) - base) * (.15 + base * .65) * material;
    }
    void main() {
      vec2 uv = vec2(vUV.x, 1. - vUV.y);
      vec2 sourceUV = vec2(vUV.x * uSourceScale.x, 1. - uv.y * uSourceScale.y);
      vec3 base = texture2D(uImage, sourceUV).rgb;
      float luma = dot(base, vec3(.2126, .7152, .0722));
      float shadow = 1. - smoothstep(.06, .55, luma);
      float highlight = smoothstep(.3, .88, luma);
      // A small black lift avoids crushing the original pixel-art shadows.
      // A visible midtone contrast curve retains both black ink and highlight
      // headroom instead of lifting the entire painting with a pale wash.
      vec3 contrastWeight = min(base * 4., vec3(1.)) * min((vec3(1.) - base) * 4., vec3(1.));
      vec3 colour = base + (base - .5) * contrastWeight * .14 * smoothstep(.045, .20, luma);
      colour = mix(vec3(luma), colour, 1.06);
      colour += vec3(.009 * shadow) * smoothstep(0., .12, luma);
      colour += uShadow * shadow * (.18 + luma);
      colour += uHighlight * highlight;
      colour += pool(uv, uPool0, uColour0, base);
      colour += pool(uv, uPool1, uColour1, base);
      colour += pool(uv, uPool2, uColour2, base);
      float depth = exp(-abs(uv.y - .44) * 12.) * (1. - luma);
      colour += uHaze * depth;
      vec2 edge = (uv - vec2(.5, .47)) * vec2(1., .85);
      float vignette = smoothstep(.11, .55, dot(edge, edge));
      // Dark painted pipework/cloth keeps its original separation. Midtone
      // walls and the stage perimeter still receive the full framing shade.
      colour *= 1. - vignette * uVignette * smoothstep(.02, .15, luma);
      // Ten levels/channel make the ordered palette texture visible at play
      // size. Native 2 px thresholds stay fixed instead of crawling like noise.
      colour = clamp(colour, 0., .99);
      vec3 quantized = floor(colour * 10. + bayer(uv * uSize)) / 10.;
      // Keep ink and very dark painted detail continuous; the visible
      // palette pattern reaches full strength through the midtones.
      colour = mix(colour, quantized, .92 * smoothstep(.025, .20, luma));
      gl_FragColor = vec4(clamp(colour, 0., 1.), 1.);
    }
  `;
  const compile = (kind, source) => {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader);
      throw new Error(reason || 'Cinematic shader compilation failed');
    }
    return shader;
  };
  let program;
  try {
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch {
    if (program) gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  gl.useProgram(program);
  const positions = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, positions);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const names = ['uImage','uSourceScale','uSize','uShadow','uHighlight','uHaze','uVignette',
    'uPool0','uPool1','uPool2','uColour0','uColour1','uColour2'];
  const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(uniforms.uImage, 0);
  let sourceWidth = 0, sourceHeight = 0;
  const renderer = { canvas, backend: 'webgl', failed: false, passes: 0,
    draw(source, width, height, profile) {
      if (renderer.failed || gl.isContextLost()) return false;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.uSourceScale, width / source.width, height / source.height);
      gl.uniform2f(uniforms.uSize, width, height);
      gl.uniform3fv(uniforms.uShadow, profile.shadow);
      gl.uniform3fv(uniforms.uHighlight, profile.highlight);
      gl.uniform3fv(uniforms.uHaze, profile.haze);
      gl.uniform1f(uniforms.uVignette, profile.vignette);
      for (let i = 0; i < 3; i++) {
        const light = profile.lights[i] || { shape: [0,0,1,1], colour: [0,0,0,0] };
        gl.uniform4fv(uniforms['uPool' + i], light.shape);
        gl.uniform4fv(uniforms['uColour' + i], light.colour);
      }
      if (sourceWidth !== source.width || sourceHeight !== source.height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        sourceWidth = source.width; sourceHeight = source.height;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      renderer.passes++;
      return true;
    }
  };
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); renderer.failed = true; });
  return renderer;
}

// Coordinates are relative to each scene, so the native portrait cutscenes
// retain the same motivated key/fill relationship as the desktop camera.
export const MOTH_CINEMATIC_PROFILES = {
  "office": {
    "shadow": [
      -0.0288,
      0.0192,
      0.06
    ],
    "highlight": [
      0.0216,
      0.0054,
      -0.0095
    ],
    "haze": [
      0.0072,
      0.0144,
      0.0216
    ],
    "vignette": 0.28,
    "lights": [
      {
        "shape": [
          0.38,
          0.2,
          0.5,
          0.65
        ],
        "colour": [
          1,
          0.65,
          0.32,
          0.475
        ]
      },
      {
        "shape": [
          0.88,
          0.25,
          0.45,
          0.7
        ],
        "colour": [
          0.32,
          0.57,
          1,
          0.25
        ]
      }
    ]
  },
  "bathroom": {
    "shadow": [
      -0.0288,
      0.0288,
      0.048
    ],
    "highlight": [
      0.0162,
      0.0135,
      0.0027
    ],
    "haze": [
      0.0036,
      0.0162,
      0.018
    ],
    "vignette": 0.315,
    "lights": [
      {
        "shape": [
          0.52,
          0.18,
          0.6,
          0.8
        ],
        "colour": [
          0.75,
          0.9,
          1,
          0.425
        ]
      },
      {
        "shape": [
          0.87,
          0.6,
          0.33,
          0.65
        ],
        "colour": [
          1,
          0.57,
          0.32,
          0.2
        ]
      }
    ]
  },
  "massage": {
    "shadow": [
      0.0144,
      -0.0096,
      0.0384
    ],
    "highlight": [
      0.0243,
      0.0027,
      -0.0081
    ],
    "haze": [
      0.0216,
      0.0054,
      0.0216
    ],
    "vignette": 0.2975,
    "lights": [
      {
        "shape": [
          0.29,
          0.32,
          0.52,
          0.65
        ],
        "colour": [
          1,
          0.56,
          0.28,
          0.475
        ]
      },
      {
        "shape": [
          0.86,
          0.35,
          0.35,
          0.6
        ],
        "colour": [
          0.68,
          0.35,
          1,
          0.25
        ]
      }
    ]
  },
  "arcade": {
    "shadow": [
      -0.0192,
      0.0096,
      0.072
    ],
    "highlight": [
      0.0162,
      -0.0041,
      0.0162
    ],
    "haze": [
      0.009,
      0.009,
      0.0414
    ],
    "vignette": 0.3325,
    "lights": [
      {
        "shape": [
          0.32,
          0.5,
          0.38,
          0.7
        ],
        "colour": [
          0.23,
          0.62,
          1,
          0.5
        ]
      },
      {
        "shape": [
          0.78,
          0.38,
          0.35,
          0.7
        ],
        "colour": [
          1,
          0.24,
          0.58,
          0.45
        ]
      }
    ]
  },
  "studio": {
    "shadow": [
      -0.0192,
      0.0096,
      0.06
    ],
    "highlight": [
      0.0243,
      0.0041,
      -0.0081
    ],
    "haze": [
      0.0054,
      0.0126,
      0.0252
    ],
    "vignette": 0.28,
    "lights": [
      {
        "shape": [
          0.28,
          0.23,
          0.44,
          0.78
        ],
        "colour": [
          1,
          0.67,
          0.34,
          0.5
        ]
      },
      {
        "shape": [
          0.77,
          0.4,
          0.43,
          0.65
        ],
        "colour": [
          0.25,
          0.53,
          1,
          0.3
        ]
      }
    ]
  },
  "river": {
    "shadow": [
      -0.024,
      0.0144,
      0.0768
    ],
    "highlight": [
      0.0243,
      0.0095,
      -0.0108
    ],
    "haze": [
      0.0108,
      0.0234,
      0.0522
    ],
    "vignette": 0.2625,
    "lights": [
      {
        "shape": [
          0.72,
          0.64,
          0.6,
          0.48
        ],
        "colour": [
          1,
          0.58,
          0.23,
          0.5
        ]
      },
      {
        "shape": [
          0.28,
          0.25,
          0.68,
          0.85
        ],
        "colour": [
          0.28,
          0.52,
          1,
          0.35
        ]
      },
      {
        "shape": [
          0.82,
          0.63,
          0.17,
          0.42
        ],
        "colour": [
          0.2,
          0.82,
          1,
          0.3
        ]
      }
    ]
  },
  "concert": {
    "shadow": [
      -0.024,
      -0.0048,
      0.06
    ],
    "highlight": [
      0.0243,
      0.0068,
      -0.0068
    ],
    "haze": [
      0.0054,
      0.0108,
      0.0468
    ],
    "vignette": 0.3675,
    "lights": [
      {
        "shape": [
          0.43,
          0.39,
          0.35,
          0.76
        ],
        "colour": [
          1,
          0.75,
          0.42,
          0.78
        ]
      },
      {
        "shape": [
          0.76,
          0.46,
          0.33,
          0.72
        ],
        "colour": [
          0.29,
          0.51,
          1,
          0.525
        ]
      },
      {
        "shape": [
          0.42,
          0.08,
          0.75,
          0.34
        ],
        "colour": [
          0.45,
          0.24,
          1,
          0.25
        ]
      }
    ]
  },
  "secretLaugh": {
    "shadow": [
      0.012,
      -0.0096,
      0.048
    ],
    "highlight": [
      0.0243,
      0.0068,
      -0.0068
    ],
    "haze": [
      0.0198,
      0.0072,
      0.027
    ],
    "vignette": 0.2975,
    "lights": [
      {
        "shape": [
          0.33,
          0.33,
          0.55,
          0.75
        ],
        "colour": [
          1,
          0.61,
          0.36,
          0.5
        ]
      },
      {
        "shape": [
          0.85,
          0.43,
          0.39,
          0.7
        ],
        "colour": [
          0.51,
          0.39,
          1,
          0.35
        ]
      }
    ]
  },
  "secretSquat": {
    "shadow": [
      -0.0192,
      0.0336,
      0.0504
    ],
    "highlight": [
      0.0189,
      0.0121,
      -0.0081
    ],
    "haze": [
      0.0054,
      0.0216,
      0.0306
    ],
    "vignette": 0.2975,
    "lights": [
      {
        "shape": [
          0.44,
          0.2,
          0.72,
          0.72
        ],
        "colour": [
          1,
          0.8,
          0.53,
          0.475
        ]
      },
      {
        "shape": [
          0.88,
          0.53,
          0.34,
          0.7
        ],
        "colour": [
          0.23,
          0.72,
          0.9,
          0.325
        ]
      }
    ]
  },
  "bedroom": {
    "shadow": [
      -0.0192,
      0.0168,
      0.0672
    ],
    "highlight": [
      0.023,
      0.0095,
      -0.0068
    ],
    "haze": [
      0.0072,
      0.0162,
      0.0288
    ],
    "vignette": 0.245,
    "lights": [
      {
        "shape": [
          0.49,
          0.28,
          0.3,
          0.48
        ],
        "colour": [
          0.3,
          0.58,
          1,
          0.475
        ]
      },
      {
        "shape": [
          0.17,
          0.43,
          0.27,
          0.47
        ],
        "colour": [
          1,
          0.62,
          0.25,
          0.525
        ]
      },
      {
        "shape": [
          0.87,
          0.82,
          0.4,
          0.45
        ],
        "colour": [
          1,
          0.65,
          0.29,
          0.425
        ]
      }
    ]
  },
  "drive": {
    "shadow": [
      -0.024,
      0.012,
      0.0624
    ],
    "highlight": [
      0.0243,
      0.0081,
      -0.0108
    ],
    "haze": [
      0.0108,
      0.018,
      0.0432
    ],
    "vignette": 0.2625,
    "lights": [
      {
        "shape": [
          0.55,
          0.6,
          0.65,
          0.5
        ],
        "colour": [
          1,
          0.58,
          0.27,
          0.45
        ]
      },
      {
        "shape": [
          0.3,
          0.22,
          0.65,
          0.6
        ],
        "colour": [
          0.25,
          0.48,
          1,
          0.325
        ]
      }
    ]
  }
};

export function patchCinematicLook(once, edit) {
  once('const RHYTHM_DIFFICULTIES = {', createMothCinematicRenderer.toString()
    + '\n\nconst MOTH_CINEMATIC_PROFILES = ' + JSON.stringify(MOTH_CINEMATIC_PROFILES) + ';\n\nconst RHYTHM_DIFFICULTIES = {');
  once('    if (!frozen) this.renderHitBursts(target);\n\n    // A dialogue box',
    '    if (!frozen) this.renderHitBursts(target);\n    // River grades before its in-scene measuring board; every other arena\n    // grades here, before the timing rail, pause button and dialogue.\n    if (!this.isRiverRhythm()) this.renderCinematicScene(target, VIEW_W, sceneHeight);\n\n    // A dialogue box');
  once('    if (!context.aftermath) this.drawLevel5RiverScoreboard(target, people, motionTime);',
    '    this.renderCinematicScene(target, VIEW_W, sceneHeight, "river");\n    if (!context.aftermath) this.drawLevel5RiverScoreboard(target, people, motionTime);');
  once('    this.renderLevel3Hud();', '    this.renderCinematicScene(this.ctx, VIEW_W, VIEW_H, "massage");\n    this.renderLevel3Hud();');
  once('    this.renderLevel4Hud();', '    this.renderCinematicScene(this.ctx, VIEW_W, VIEW_H, "bedroom");\n    this.renderLevel4Hud();');
  once('    if (tallFight) target.restore();\n  }\n\n  enterLevel5Stage1()',
    '    if (tallFight) target.restore();\n    if (dialogue) this.renderCinematicScene(target, width, sceneHeight, "studio");\n  }\n\n  enterLevel5Stage1()');
  once('    target.restore();\n  }\n\n  // Where the road layer\'s warm light pools',
    '    target.restore();\n    this.renderCinematicScene(target, W, H, "drive");\n  }\n\n  // Where the road layer\'s warm light pools');
  once('    target.restore();\n  }\n\n  getLevel6BedLayout(W, H, t)',
    '    target.restore();\n    this.renderCinematicScene(target, W, H, "bedroom");\n  }\n\n  getLevel6BedLayout(W, H, t)');
  once('    }\n  }\n\n  renderLevel6WakeDialogue()',
    '    }\n    this.renderCinematicScene(target, W, H, "bedroom");\n  }\n\n  renderLevel6WakeDialogue()');
  // Retain the old method for callers in the original bathroom renderer.
  // The scene pass replaces the tint/grain/vignette that used to cover HUD.
  edit('  renderLevel1OfficeFilmGrain(target, motionTime, sceneHeight = VIEW_H, vignetteHeight = sceneHeight) {',
    '    output.drawImage(cached.layer, 0, 0);\n  }', () => '  renderLevel1OfficeFilmGrain() {}');
}

export const CINEMATIC_LOOK_METHODS = `
  renderCinematicScene(target, width, height, name = this.level1OfficeRhythm?.theme || "office") {
    if (this.cinematicLookEnabled === false || !target?.canvas || width <= 0 || height <= 0) return;
    const profile = MOTH_CINEMATIC_PROFILES[name] || MOTH_CINEMATIC_PROFILES.office;
    width = Math.min(target.canvas.width, Math.round(width));
    height = Math.min(target.canvas.height, Math.round(height));
    const started = performance.now();
    if (this.cinematicRenderer === undefined) {
      try { this.cinematicRenderer = createMothCinematicRenderer(); }
      catch { this.cinematicRenderer = null; }
    }
    target.save();
    // The source already contains camera shake/scene transforms; replacing
    // those pixels in device space avoids applying a camera transform twice.
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
    let gpu = false;
    if (this.cinematicRenderer && !this.cinematicRenderer.failed) {
      try {
        gpu = this.cinematicRenderer.draw(target.canvas, width, height, profile);
        if (gpu) target.drawImage(this.cinematicRenderer.canvas, 0, 0, width, height);
      } catch { this.cinematicRenderer.failed = true; }
    }
    if (!gpu) this.renderCinematicFallback(target, width, height, profile);
    target.restore();
    this.cinematicTelemetry = { profile: name, backend: gpu ? "webgl" : "canvas2d",
      width, height, ditherPixelSize: 2, paletteLevels: 10, ditherMix: .92, animatedNoise: false, cpuPixelReadback: false,
      passMs: performance.now() - started, passes: this.cinematicRenderer?.passes || 0 };
  }

  renderCinematicFallback(target, width, height, profile) {
    // Canvas-only devices still get fixed ordered texture and the same light
    // placement. Patterns are built once, without getImageData/readPixels.
    if (!this.cinematicDitherPatterns) {
      const bayer = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
      const make = (light) => {
        // Keep independent immutable sources even on engines that retain a
        // live canvas as a CanvasPattern source.
        const tile = document.createElement("canvas"); tile.width = tile.height = 8;
        const ink = tile.getContext("2d");
        bayer.forEach((value, index) => {
          const alpha = Math.abs((value + .5) / 16 - .5) * .26;
          if ((value >= 8) !== light) return;
          ink.fillStyle = light ? "rgba(245,237,218," + alpha + ")" : "rgba(9,14,25," + alpha + ")";
          ink.fillRect(index % 4 * 2, Math.floor(index / 4) * 2, 2, 2);
        });
        return target.createPattern(tile, "repeat");
      };
      this.cinematicDitherPatterns = [make(false), make(true)];
    }
    target.globalCompositeOperation = "screen";
    for (const light of profile.lights) {
      const [x,y,rx,ry] = light.shape, [r,g,b,strength] = light.colour;
      target.save(); target.translate(x * width, y * height); target.scale(rx * width, ry * height);
      const gradient = target.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, "rgba(" + Math.round(r * 255) + "," + Math.round(g * 255) + "," + Math.round(b * 255) + "," + strength * .85 + ")");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      target.fillStyle = gradient; target.fillRect(-1, -1, 2, 2); target.restore();
    }
    // Overlay retains true black linework and highlight headroom instead
    // of stamping pale dots onto the painting's ink outlines.
    target.globalCompositeOperation = "overlay";
    for (const pattern of this.cinematicDitherPatterns) { target.fillStyle = pattern; target.fillRect(0, 0, width, height); }
    target.globalCompositeOperation = "source-over";
    const vignette = target.createRadialGradient(width * .5, height * .47, width * .16,
      width * .5, height * .47, width * .61);
    vignette.addColorStop(0, "rgba(4,8,19,0)");
    vignette.addColorStop(1, "rgba(4,8,19," + profile.vignette * .7 + ")");
    target.fillStyle = vignette; target.fillRect(0, 0, width, height);
  }
`;
