// Code of the game's retired parts, left out of both builds (owner, 2026-10-14:
// "no redundant code"). These are the parts whose art moth-asset-trim.mjs
// already removed. Every method listed must be unreachable
// (moth-reachability.mjs), or the build stops. Once they are gone, top-level
// helpers that nothing names any more go too. MOTH_TRIM_AUDIT=1 builds a
// version that keeps them and records any call instead
// (window.__retiredCalls), for checking with every suite.
import assert from 'node:assert/strict';
import { analyzeReachability } from './moth-reachability.mjs';

export const RETIRED_METHOD_GROUPS = {
  'Level 1: the old road tutorial ride': ['startTutorialStage0', 'updateTutorial', 'updateTutorialRideIn', 'advanceTutorialIntro',
    'renderTutorialIntroDialogue', 'renderTutorialStepDialogue'],
  'Level 1: the office before the M.O.T.H engine (old renderers, HUD and results)': ['renderLegacyLevel1OfficeScene', 'renderLevel1OfficeSceneLegacy',
    'renderLevel1OfficeHud', 'getLevel1OfficeResult', 'getLevel1OfficeResultsContinueRect', 'level1OfficeGanganDialogueOptions'],
  'Level 2: the old sewer exploration and its third stage': ['updateSewer', 'renderSewerScene', 'renderSewerHud', 'nudgeSewerWrongWay',
    'advanceSewerIntroDialogue', 'renderSewerIntroDialogue', 'getSewerIntroControlLines', 'getSewerIntroDialogueLines', 'enterLevel2Stage3',
    'renderLevel2Stage3Props', 'createStage3ChestContents'],
  'Level 3: the old battle placeholder': ['startLevel3BossPlaceholder'],
  'Level 4: the old side-view Bonita boss': ['startLevel4BossIntro', 'startLevel4BossFight', 'updateLevel4Boss', 'updateLevel4BossPlayerAttack',
    'updateLevel4BossShots', 'spawnLevel4BossStar', 'spawnLevel4BossWave', 'damageLevel4Boss', 'failLevel4Boss', 'winLevel4BossFight',
    'level4BossBodyCenter', 'getLevel4BossFightConfig', 'drawLevel4BossShots', 'drawLevel4GameBoss', 'renderLevel4BossIntro',
    'renderLevel4BossScene', 'renderLevel4BossHud', 'renderLevel4BossVictory'],
  'Level 5: the old highway walk': ['enterLevel5Stage1Walk'],
  'The old finale: backstage walk, forge and chest': ['startFinaleDialogue', 'advanceFinaleDialogue', 'renderFinaleDialogue', 'updateFinale',
    'renderFinaleScene', 'renderFinaleHud', 'getFinalePrompt', 'getFinaleWorldPoint', 'tryFinaleInteract', 'tryFinaleJump',
    'isFinaleNearChest', 'isFinaleNearForge', 'isFinaleNearGanGan', 'isFinaleReadyForFinalConversation', 'drawFinaleBackstageMap',
    'drawFinaleBobby', 'drawFinaleGanGan', 'drawFinaleChest', 'drawFinaleTiledImageCrop', 'drawFinaleFireworks', 'drawFinaleSongCard',
    'drawFinaleEndingPerformers', 'ensureFinaleEndingVideo', 'createFinaleChestContents', 'collectFinaleChestSongs', 'saveFinaleChestProgress',
    'formatFinaleMissingSongs', 'openFinaleForge', 'closeFinaleForge', 'tryStartFinaleForge', 'createFinaleForgeState', 'updateFinaleForge',
    'handleFinaleForgePointerDown', 'renderFinaleForgeWindow', 'renderFinaleForgeDrag', 'renderFinaleForgeResultPage', 'drawFinaleForgeMachine',
    'drawFinaleForgeSlot', 'drawFinaleForgeButton', 'drawFinaleForgeCloseButton', 'drawFinaleForgeRewardCard', 'drawFinaleForgeRewardIcon',
    'getFinaleForgeAvailableSongDefs', 'getFinaleForgeMissingSongIds', 'getFinaleForgeRequiredSongIds', 'getFinaleForgeRewardDefs',
    'isFinaleForgeRewardCollected', 'isFinaleForgeRewardsReady', 'collectFinaleForgeReward'],
  'The old title screen and input helpers': ['renderTitleAttractLoop', 'continueSavedGame', 'getHomeMenuRowRects',
    'getHomePlaylistTransportButtons', 'handlePrimaryKeyPress', 'noteMobileSecondaryTap', 'hasWeaponCollected']
};
export const RETIRED_METHODS = new Set(Object.values(RETIRED_METHOD_GROUPS).flat());

// A top-level declaration that can go once nothing names it: a function, or a
// constant whose value has no side effects.
function harmless(ts, node) {
  if (!node) return true;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isLiteralExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isIdentifier(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isPrefixUnaryExpression(node)) return harmless(ts, node.operand);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression?.(node)) return harmless(ts, node.expression);
  if (ts.isTemplateExpression(node)) return node.templateSpans.every(span => harmless(ts, span.expression));
  if (ts.isBinaryExpression(node)) return harmless(ts, node.left) && harmless(ts, node.right);
  if (ts.isPropertyAccessExpression(node)) return harmless(ts, node.expression);
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(element => harmless(ts, element));
  if (ts.isObjectLiteralExpression(node)) return node.properties.every(property =>
    ts.isPropertyAssignment(property) ? harmless(ts, property.initializer) : ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property));
  if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && /^(Set|Map|Object\.freeze)$/.test(node.expression.getText())) return (node.arguments || []).every(arg => harmless(ts, arg));
  return false;
}

export function trimRetiredCode(source, ts, { audit = false } = {}) {
  const { methods, unreachable } = analyzeReachability(source, ts);
  for (const name of RETIRED_METHODS) {
    assert(methods.includes(name), `Retired method still in the release: ${name}`);
    assert(unreachable.includes(name), `Retired method has become reachable: ${name}`);
  }
  let sf = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const cls = sf.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'BobbyGame');
  const members = cls.members.filter(member => RETIRED_METHODS.has(member.name?.getText(sf)));
  const edits = members.map(member => audit
    ? { start: member.body.getStart(sf) + 1, end: member.body.getStart(sf) + 1, text: `\n    (window.__retiredCalls ||= []).push(${JSON.stringify(member.name.getText(sf))});` }
    : { start: member.getFullStart(), end: member.getEnd(), text: '' });
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const removedHelpers = [];
  if (audit) return { source, removedMethods: members.length, removedHelpers };
  // Top-level helpers nothing names any more, until none are left.
  for (let pass = 0; pass < 20; pass++) {
    sf = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const uses = new Map();
    const count = node => { if (ts.isIdentifier(node)) uses.set(node.text, (uses.get(node.text) || 0) + 1); ts.forEachChild(node, count); };
    count(sf);
    const dead = sf.statements.filter(statement => {
      if (ts.isFunctionDeclaration(statement) && statement.name) return uses.get(statement.name.text) === 1;
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
        const [declaration] = statement.declarationList.declarations;
        return ts.isIdentifier(declaration.name) && uses.get(declaration.name.text) === 1 && harmless(ts, declaration.initializer);
      }
      return false;
    });
    if (!dead.length) break;
    for (const statement of dead) removedHelpers.push((statement.name || statement.declarationList.declarations[0].name).getText(sf));
    for (const statement of dead.sort((a, b) => b.getFullStart() - a.getFullStart())) source = source.slice(0, statement.getFullStart()) + source.slice(statement.getEnd());
  }
  return { source, removedMethods: members.length, removedHelpers };
}
