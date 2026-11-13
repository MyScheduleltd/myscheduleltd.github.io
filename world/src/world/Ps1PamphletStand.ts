import * as THREE from 'three';
import { createLightBoxHousing, loadLightBoxFace } from './Ps1LightBoxHousing';
import headerFace from '../assets/ps1/pamphlet/header.png';
import coverOne from '../assets/ps1/pamphlet/cover1.png';
import coverTwo from '../assets/ps1/pamphlet/cover2.png';
import coverThree from '../assets/ps1/pamphlet/cover3.png';

/**
 * The festival pamphlet stand in the PS1 look (the owner, 2026-11-11: "please
 * redesign the sign on the pamphlet stand and the modeling of the pamphlet 3D
 * asset to match with the current aesthetic of the world"). It was a dark
 * literature rack under a glowing teal neon frame; now it is a Showa-era
 * honey-timber rack like the light-box signs round it: a cabinet with a cream
 * enamel front, a sloping tray of three stacks of programme booklets, and a
 * cream light-box header on two iron posts lettered 影展手冊.
 *
 * The covers were painted with Higgsfield (no lettering, so nothing to get
 * wrong) and the header set in Yuanti TC Bold:
 * `world/art/pamphlet-stand-20261111/build-faces.py`.
 *
 * Built facing +Z with its foot at y 0, inside the old footprint (2.05 by
 * 1.12), so the stand's collider and the MENTOR's post are unchanged.
 */
export const PS1_PAMPHLET_STAND = Object.freeze({
  width: 2.05, depth: 1.12,
  /** The tray's top front edge, where hands reach. */
  trayHeight: 1.62,
  header: { width: 1.9, height: .71, centre: 3.2, back: -.4 },
});

const flat = (colour: number, roughness = .8) => {
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0, flatShading: true });
  material.userData.wornNoMasonry = true;
  return material;
};

export function createPs1PamphletStand(): THREE.Group {
  const stand = new THREE.Group();
  stand.name = 'Festival pamphlet rack';
  const s = PS1_PAMPHLET_STAND;
  const timber = flat(0x9a7350), darkTimber = flat(0x6f5139), enamel = flat(0xe9dfc8, .6), indigo = flat(0x34446b, .6);
  const iron = flat(0x3b3d3f, .5), paper = flat(0xf1ead8, .9), plinth = flat(0x3b3530);
  const box = (size: [number, number, number], at: [number, number, number], material: THREE.Material, parent: THREE.Object3D = stand) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // Plinth and cabinet.
  box([s.width, .14, s.depth], [0, .07, 0], plinth);
  box([1.95, 1.3, 1.0], [0, .79, 0], timber);
  // The enamel front, a few centimetres proud, ruled in indigo.
  box([1.62, .92, .03], [0, .8, .516], enamel);
  for (const y of [.37, 1.23]) box([1.62, .035, .036], [0, y, .52], indigo);
  for (const x of [-.79, .79]) box([.035, .9, .036], [x, .8, .52], indigo);
  box([1.95, .06, 1.04], [0, 1.47, 0], darkTimber);
  // The tray, tilted towards the reader, with a lip that holds the booklets.
  const tray = new THREE.Group();
  tray.position.set(0, 1.56, .05);
  tray.rotation.x = .3;
  stand.add(tray);
  box([1.95, .08, 1.0], [0, 0, 0], darkTimber, tray);
  box([1.95, .16, .06], [0, .06, .5], timber, tray);
  for (const x of [-.98, .98]) box([.06, .16, 1.0], [x, .06, 0], timber, tray);
  // Three stacks of booklets, their covers up.
  const covers = [coverOne, coverTwo, coverThree];
  for (const [i, x] of [-.62, 0, .62].entries()) {
    box([.54, .1, .74], [x, .09, -.02], paper, tray);
    const map = loadLightBoxFace(covers[i], `PS1 pamphlet cover ${i + 1}`);
    map.magFilter = THREE.NearestFilter;
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(.54, .72), new THREE.MeshStandardMaterial({ map, roughness: .85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    cover.rotation.x = -Math.PI / 2;
    cover.position.set(x, .142, -.02);
    cover.name = `pamphlet cover ${i + 1}`;
    tray.add(cover);
  }
  // Two iron posts at the back carry the header.
  const h = s.header, top = h.centre + h.height / 2 + .14;
  for (const x of [-.86, .86]) box([.07, top - 1.45, .07], [x, (top + 1.45) / 2, h.back - .2], iron);
  const housing = createLightBoxHousing(h.width, h.height, .1, 0xd6d1c4);
  housing.position.set(0, h.centre, h.back);
  stand.add(housing);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(h.width, h.height), new THREE.MeshBasicMaterial({ map: loadLightBoxFace(headerFace, 'PS1 pamphlet header'), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  face.position.set(0, h.centre, h.back);
  face.name = '影展手冊 header';
  stand.add(face);
  return stand;
}
