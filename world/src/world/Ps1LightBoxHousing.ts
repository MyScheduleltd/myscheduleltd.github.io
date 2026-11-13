import * as THREE from 'three';
import { assetObjectUrl } from './AssetMirror';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * The housing of a PS1 light-box sign (the owner, 2026-11-10, after their
 * Showa-era light-box references): a box with rounded corners behind the
 * printed face, its rim standing a little proud all round. It replaces the
 * venue boards' neon-tube frames.
 *
 * Built in the face's own frame, which looks along +Z: the face is at z 0,
 * the housing behind it, so it can be positioned and turned like the panel.
 */
export const LIGHT_BOX_RIM = .14;
export const LIGHT_BOX_DEPTH = .32;

const housings = new Map<number, THREE.MeshStandardMaterial>();

/** One shared material per housing colour. */
export function lightBoxHousingMaterial(colour = 0xd6d1c4): THREE.MeshStandardMaterial {
  let material = housings.get(colour);
  if (!material) {
    // Pushed back in the depth test, so far off its front never shows through
    // the face a few centimetres in front of it (the owner, 2026-11-10: signs
    // "glitching in distance").
    material = new THREE.MeshStandardMaterial({ color: colour, roughness: .55, metalness: .05, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    material.name = 'PS1 light-box housing';
    material.userData.wornNoMasonry = true;
    material.userData.preserveAuthoredSurface = true;
    housings.set(colour, material);
  }
  return material;
}

/** A rounded box `width` by `height` (the face's size) plus the rim, standing behind z 0. */
export function lightBoxHousingGeometry(width: number, height: number, depth = LIGHT_BOX_DEPTH, rim = LIGHT_BOX_RIM): THREE.BufferGeometry {
  const radius = Math.min(rim * 1.1, (Math.min(width, height) + rim * 2) / 4);
  const geometry = new RoundedBoxGeometry(width + rim * 2, height + rim * 2, depth, 2, radius);
  geometry.translate(0, 0, -depth / 2 - .03);
  return geometry;
}

/** The housing as a mesh, to set behind a face panel (copy the panel's position and turn). */
export function createLightBoxHousing(width: number, height: number, rim = LIGHT_BOX_RIM, colour = 0xd6d1c4): THREE.Mesh {
  const housing = new THREE.Mesh(lightBoxHousingGeometry(width, height, LIGHT_BOX_DEPTH, rim), lightBoxHousingMaterial(colour));
  housing.name = 'PS1 light-box housing';
  // No shadow: signs hang high, and every caster is redrawn into the sun's map each frame.
  housing.castShadow = false;
  housing.receiveShadow = true;
  return housing;
}

/**
 * A picture as a texture, filled in when its bytes are here: by way of
 * `fetchAsset`, so from the sign-in page's early download (AssetMirror) when
 * it has them. Where there is no image loader (the Node tests build venues
 * against a stub document) it stays an empty texture.
 */
export function pictureTexture(url: string): THREE.Texture {
  const texture = new THREE.Texture();
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return texture;
  const show = (image: HTMLImageElement) => { texture.image = image; texture.needsUpdate = true; };
  if (url.startsWith('data:')) { new THREE.ImageLoader().load(url, show); return texture; }
  void assetObjectUrl(url)
    .then(objectUrl => new THREE.ImageLoader().loadAsync(objectUrl).finally(() => URL.revokeObjectURL(objectUrl)))
    .then(show, () => undefined);
  return texture;
}

/**
 * A light-box face texture: a clean printed graphic, so it is filtered
 * smoothly and mipmapped rather than drawn as chunky pixels.
 */
export function loadLightBoxFace(url: string, name: string): THREE.Texture {
  const texture = pictureTexture(url);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}
