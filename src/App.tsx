import { GameplayBadge } from './GameplayBadge';
import { DEAL_RANGE_LABEL, isUnsolvableDeal, nextPlayableDeal, validDeal } from './deals';
import { DEFAULT_SETTINGS, EMPTY_STATS } from './game';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, CircleHelp, Flag, Lightbulb, MoreHorizontal, Play, Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Trophy, Undo2, WandSparkles, X } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { SUITS, autoCollect, boardKey, canMove, capacity, cardName, describeMove, finishBoard, hintReason, loadGame, loadSettings, loadStats, moveBoard, newGame, picked, rankedHints, sequence, smartTargets, usefulMoves, gameWon, type Board, type DailyVariant, type Game, type Move, type Source, type Target } from './game';
import { useScreenOrientation } from './useScreenOrientation';
import { usePixiMotion } from './usePixiMotion';
import { usePressRepeat } from './usePressRepeat';
import { useHintPress } from './useHintPress';
import { useSolvabilityPreview } from './useSolvabilityPreview';
import { PixiBoard } from './PixiBoard';
import { useGamePersistence } from './useGamePersistence';
import { SettingsPanel, StatsPanel } from './GamePanels';
import { abandonRun, beginRun, progressRun, dailyMasterDeal, today, winRun } from './records';
import { loadBackground } from './background';
import { DIFFICULTIES, dealDifficulty, difficultyDeal, difficultyInfo, gameDifficultyLabel, type Difficulty } from './difficulty';
import { feedback, unlockAudio, type Cue } from './feedback';
import { WinRewards } from './WinRewards';
import { settleAchievements, trackAchievementRun, trackAchievementAction } from './achievements';
import { BadgeEmblem } from './BadgeEmblem';
import { newEndgame, ENDGAME_XP, endgameMode, endgameGoal, endgameProgress } from './endgames';
import { dailySpecial, newSpecialGame, specialRuleInfo, specialTitle, specialRecordKey, specialRewardKey, isDailyVariant, DAILY_VARIANTS, precisionMedal, SPECIAL_XP } from './specialRules';
import { DAILY_MASTER_XP, difficultyReward, firstWinAvailable, levelProgress } from './progression';

type Panel = 'menu' | 'new' | 'rules' | 'settings' | 'stats' | 'restart' | 'deal' | 'pause' | null;
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
const sameSource = (a: Source | null, b: Source) => a?.kind === b.kind && a.index === b.index && a.offset === b.offset;
const COMPACT_QUERY = '(max-width: 700px), (pointer: coarse) and (max-width: 1100px)';

export default function App() {
  const [game, setGame] = useState<Game>(() => loadGame() || newGame(617));
  const [stats, setStats] = useState(() => settleAchievements(loadStats()));
  const [settings, setSettings] = useState(loadSettings);
  const [selection, setSelection] = useState<Source | null>(null);
  const [suggestion, setSuggestion] = useState<Move | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState('点选一张牌，再点它的目的地');
  const [messageActive, setMessageActive] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  const landscape = settings.landscape;
  const orientation = useScreenOrientation(landscape);
  const [dealInput, setDealInput] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => dealDifficulty(game.deal));
  const [pickingDeal, setPickingDeal] = useState(false);
  const pickGeneration = useRef(0);
  const [inputError, setInputError] = useState('');
  const [drag, setDrag] = useState(false);
  const [photo, setPhoto] = useState(loadBackground);
  const [dailyDate, setDailyDate] = useState(today);
  const [dismissedStuck, setDismissedStuck] = useState('');
  const [visible, setVisible] = useState(!document.hidden);
  const [winDismissed, setWinDismissed] = useState(false);
  const motion = usePixiMotion(game.board);
  const verification = useSolvabilityPreview(game, motion);
  const verifying = verification.state !== null;
  const persistence = useGamePersistence(game, stats, settings, motion.busy || !!drag || verifying);
  const saveFailed = persistence.failed;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintIndex = useRef(0);
  const autoResumePending = useRef(false);
  const lastWinCue = useRef(gameWon(game) ? game.id : '');
  const playerLevel = levelProgress(stats.xp);
  const currentDifficultyLabel = gameDifficultyLabel(game);
  const knownUnsolvable = !game.endgame && !game.special && isUnsolvableDeal(game.deal);
  const autoEnabled = settings.auto;
  const firstWinReady = firstWinAvailable(stats, dailyDate);
  const dailyRewardClaimed = !!stats.masters[dailyDate] || stats.xpAwards.includes(`master:${dailyDate}`);
  const endgameRewardClaimed = !!stats.endgames[dailyDate] || stats.xpAwards.includes(`endgame:${dailyDate}`);
  const specialRewardClaimed = !!stats.specials[dailyDate] || stats.xpAwards.includes(`special:${dailyDate}`);
  const savedSpecialBest = game.special ? stats.specials[specialRecordKey(game.special)] : undefined;
  const specialBest = savedSpecialBest?.version === game.special?.version ? savedSpecialBest : undefined;
  const nextDeal = game.masterDate || game.endgame || game.special ? settings.nextDeal : nextPlayableDeal(game.deal);
  const isWon = gameWon(game);
  const winOpen = isWon && !winDismissed && !motion.busy;
  const playingPaused = !!panel || winOpen || !visible || pickingDeal;
  const paused = playingPaused || verifying;
  const forwardMoves = useMemo(() => usefulMoves(game.board), [game.board]);
  const stuck = game.started && !isWon && !forwardMoves.length;
  const availableFinish = useMemo(() => {
    if (!game.endgame) return finishBoard(game.board, game.held);
    const board = autoCollect(game.board, game.held).board;
    return gameWon({ board, endgame: game.endgame }) ? board : null;
  }, [game.board, game.held, game.endgame]);
  const stuckKey = useMemo(() => `${game.id}:${boardKey(game.board)}`, [game.id, game.board]);

  useEffect(() => {
    if (panel === 'new') setDailyDate(today());
    if (panel !== 'new' && !winOpen) { ++pickGeneration.current; setPickingDeal(false); }
  }, [panel, winOpen]);

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    // A layout change invalidates drag offsets and in-flight card positions.
    motion.cancel();
    setDrag(false);
  }, [landscape, orientation.rotated]);

  useLayoutEffect(() => {
    if (!isTauri() || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    const landscape = window.matchMedia('(orientation: landscape)');
    const update = () => {
      // iOS 17 can report a fixed-position viewport shortened by both safe
      // areas. This native app is fullscreen; use screen CSS pixels instead.
      const sides = [window.screen.width, window.screen.height];
      const height = landscape.matches ? Math.min(...sides) : Math.max(...sides);
      document.documentElement.style.setProperty('--app-height', `${height}px`);
    };
    update();
    landscape.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      landscape.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--app-height');
    };
  }, []);

  useEffect(() => {
    const preventGesture = (event: Event) => event.preventDefault();
    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    const options = { passive: false };
    // iOS WebViews can allow pinch zoom despite the viewport declaration.
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(name, preventGesture, options);
    }
    document.addEventListener('touchstart', preventMultiTouch, options);
    document.addEventListener('touchmove', preventMultiTouch, options);
    return () => {
      for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        document.removeEventListener(name, preventGesture);
      }
      document.removeEventListener('touchstart', preventMultiTouch);
      document.removeEventListener('touchmove', preventMultiTouch);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--table-photo', settings.photo && photo ? `url("${photo}")` : 'none');
    document.documentElement.dataset.photo = settings.photo && photo ? 'true' : 'false';
  }, [settings.theme, settings.photo, photo]);
  useEffect(() => {
    const timer = setInterval(() => setDailyDate(today()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const unlock = () => unlockAudio(settings.sound);
    document.addEventListener('pointerdown', unlock, { capture: true });
    return () => document.removeEventListener('pointerdown', unlock, true);
  }, [settings.sound]);

  const announce = useCallback((text: string) => {
    setMessage(text);
    setMessageActive(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { setMessage('点选移动 · 拖动也可以'); setMessageActive(false); }, 5500);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (paused || isWon || !game.started) return;
    const timer = setInterval(() => {
      setGame(g => verification.active.current ? g : { ...g, seconds: g.seconds + 1 });
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, isWon, game.started]);
  useEffect(() => {
    if (!isWon) return;
    setStats(s => winRun(s, game));
  }, [isWon, game.id, game.seconds, game.moves]);
  useEffect(() => {
    if (game.started && !isWon) setStats(s => progressRun(s, game));
  }, [game.started, game.id, game.moves, isWon, playingPaused]);
  useEffect(() => {
    if (winOpen && lastWinCue.current !== game.id) {
      lastWinCue.current = game.id; feedback('win', settings);
    }
  }, [winOpen, game.id, settings]);
  function clearPick() { setSelection(null); setSuggestion(null); hintIndex.current = 0; }
  function cancelSelection() {
    if (paused || motion.isBusy()) return;
    if (selection || suggestion) { clearPick(); announce('已取消选择'); }
  }
  function clickBackground(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as Element).closest('button, input, select, a, [role="dialog"]')) return;
    cancelSelection();
  }
  function commit(board: Board, text?: string, held = game.held, cue: Cue = 'move', steps: Board[] = [], move?: Move, observedBoard?: Board) {
    if (motion.isBusy()) return;
    motion.capture(undefined, false, steps);
    if (!game.started) setStats(s => beginRun(s, game));
    const cost = game.special?.kind === 'precision'
      ? Math.max(1, board.foundations.reduce((sum, rank, suit) => sum + Math.max(0, rank - game.board.foundations[suit]), 0) + (move && move.to.kind !== 'foundation' ? 1 : 0)) : 1;
    setGame(g => ({ ...g, achievementRun: trackAchievementRun(g, [observedBoard ?? board, ...steps, board], autoEnabled, move), board, held, heldHistory: [...g.heldHistory, g.held], heldRedo: [], history: [...g.history, g.board], redo: [], moveCosts: [...(g.moveCosts ?? g.history.map(() => 1)), cost], redoCosts: [], moves: g.moves + cost, started: true }));
    feedback(cue, settings);
    clearPick();
    setWinDismissed(false);
    if (text) announce(text);
  }
  useEffect(() => {
    autoResumePending.current = autoEnabled && !playingPaused;
  }, [autoEnabled, playingPaused, game.id]);
  useEffect(() => {
    if (!autoResumePending.current || !autoEnabled || paused || motion.busy || motion.isBusy()) return;
    autoResumePending.current = false;
    if (!game.started || isWon) return;
    const result = autoCollect(game.board, game.held, true);
    if (result.count) commit(result.board, `自动收起 ${result.count} 张牌`, game.held, 'collect', result.steps);
    // Resuming/enabling auto collection should work on an already opened
    // position. Ordinary undo/redo does not schedule a new automatic pass.
  }, [autoEnabled, paused, game.id, motion.busy]);
  function perform(from: Source, to: Target) {
    if (paused || isWon || motion.isBusy()) return false;
    if (!canMove(game.board, from, to)) {
      if (drag) feedback('error', settings);
      const cards = picked(game.board, from);
      if (game.special?.kind === 'three-cells' && to.kind === 'cell' && to.index === 3) { announce('第四个中转格已封印，请使用其他三个格子'); return false; }
      if (game.special?.kind === 'kings-empty' && to.kind === 'column' && !game.board.columns[to.index].length && cards[0]?.rank !== 13) { announce('今天的空列只能放 K 或以 K 开头的牌组'); return false; }
      if (game.special?.kind === 'suit-first' && to.kind === 'foundation' && to.index !== game.special.prioritySuit && game.board.foundations[game.special.prioritySuit] < 13) { announce(specialRuleInfo(game.special).description); return false; }
      announce(to.kind === 'column' && cards.length > capacity(game.board, to) ? `空间不足：当前最多可搬 ${capacity(game.board, to)} 张，${game.special?.kind === 'kings-empty' ? '腾出中转格' : '腾出中转格或空列'}` : to.kind === 'foundation' ? game.special?.kind === 'reverse' ? '收牌区按同花色从 K 到 A 递减' : '收牌区按同花色从 A 到 K 递增' : to.kind === 'cell' ? '每个中转格只能放一张牌' : game.special?.kind === 'same-suit' ? '请按同花色、点数递减的顺序接牌' : game.special?.kind === 'reverse' ? '请按红黑交替、点数递增的顺序接牌' : '请按红黑交替、点数递减的顺序接牌');
      return false;
    }
    const board = moveBoard(game.board, { from, to });
    const card = picked(game.board, from)[0];
    const held = from.kind === 'foundation' ? [...new Set([...game.held, card.id])] : to.kind === 'foundation' ? game.held.filter(id => id !== card.id) : game.held;
    const result = autoEnabled ? autoCollect(board, held, true) : { board, count: 0, steps: [] };
    commit(result.board, from.kind === 'foundation' ? '已取回，暂不自动收起这张牌；可手动移回收牌区' : result.count ? `已移动，并自动收起 ${result.count} 张牌` : '已移动', held, result.count || to.kind === 'foundation' ? 'collect' : 'move', result.count ? [board, ...result.steps] : [], { from, to }, board);
    return true;
  }
  function choose(source: Source) {
    if (paused || isWon || motion.isBusy()) return;
    if (selection) {
      if (sameSource(selection, source)) { quickMove(source); return; }
      if (selection.kind !== source.kind || selection.index !== source.index) {
        perform(selection, { kind: source.kind, index: source.index });
        return;
      }
    }
    const cards = picked(game.board, source);
    if (!sequence(cards, game.board)) { announce(game.special?.kind === 'same-suit' ? '只能选取同花色、依次递减的连续牌组' : game.special?.kind === 'reverse' ? '只能选取红黑交替、依次递增的连续牌组' : '只能选取红黑交替、依次递减的连续牌组'); return; }
    if (compact && source.kind !== 'foundation' && cards.length === 1) {
      const target: Target = { kind: 'foundation', index: cards[0].suit };
      if (canMove(game.board, source, target)) { perform(source, target); return; }
    }
    if (!selection && settings.singleTap && source.kind !== 'foundation') {
      const targets = smartTargets(game.board, source);
      if (targets.length === 1) { perform(source, targets[0]); return; }
      if (targets.length > 1) {
        setSelection(source); setSuggestion(null); feedback('select', settings);
        announce(`有 ${targets.length} 个可用落点，请点选目的地`); return;
      }
    }
    setSelection(source);
    setSuggestion(null);
    feedback('select', settings);
    announce(`已选 ${cardName(cards[0])}${cards.length > 1 ? ` 等 ${cards.length} 张` : ''}，点选目的地`);
  }
  function chooseTarget(target: Target) {
    if (paused || isWon || motion.isBusy()) return;
    if (selection) perform(selection, target);
    else announce(target.kind === 'cell' ? '中转格可暂存一张牌' : target.kind === 'foundation' ? game.special?.kind === 'reverse' ? '从 K 开始，将同花色的牌递减收至 A' : '从 A 开始，将同花色的牌依次收起' : '空列可放任意单张牌或可搬动的连续牌组');
  }
  function quickMove(source: Source) {
    if (paused || isWon || motion.isBusy()) return;
    const cards = picked(game.board, source);
    if (cards.length !== 1) {
      const targets = smartTargets(game.board, source);
      if (targets.length === 1) perform(source, targets[0]);
      else announce(targets.length ? `有 ${targets.length} 个可用落点，请点选目的地` : '这组牌暂时没有可用落点');
      return;
    }
    const foundation: Target = { kind: 'foundation', index: cards[0].suit };
    if (canMove(game.board, source, foundation)) perform(source, foundation);
    else {
      const index = game.board.cells.findIndex((card, index) => !card && canMove(game.board, source, { kind: 'cell', index }));
      if (source.kind === 'column' && index >= 0) perform(source, { kind: 'cell', index });
      else announce('这张牌暂时不能收起');
    }
  }
  function tapCard(from: Source) {
    if (paused || isWon || motion.isBusy()) return;
    choose(from);
  }
  function undo() {
    if (isWon || motion.isBusy()) return;
    const board = game.history.at(-1);
    if (!board) return;
    motion.capture(undefined, true);
    setGame(g => ({ ...g, achievementRun: trackAchievementAction(g, 'undo'), board, held: g.heldHistory.at(-1) ?? [], heldHistory: g.heldHistory.slice(0, -1), heldRedo: [...g.heldRedo, g.held], history: g.history.slice(0, -1), redo: [...g.redo, g.board], moveCosts: (g.moveCosts ?? g.history.map(() => 1)).slice(0, -1), redoCosts: [...(g.redoCosts ?? g.redo.map(() => 1)), g.moveCosts?.at(-1) ?? 1], moves: Math.max(0, g.moves - (g.moveCosts?.at(-1) ?? 1)) }));
    feedback('move', settings);
    clearPick(); setWinDismissed(false); announce('已撤销上一步，包括自动收牌');
  }
  const { holding: holdingUndo, ...undoPress } = usePressRepeat(undo, !!game.history.length && !paused && !isWon);
  function redo() {
    if (isWon || motion.isBusy()) return;
    const board = game.redo.at(-1);
    if (!board) return;
    motion.capture(undefined, true);
    setGame(g => ({ ...g, achievementRun: trackAchievementAction(g, 'redo'), board, held: g.heldRedo.at(-1) ?? [], heldHistory: [...g.heldHistory, g.held], heldRedo: g.heldRedo.slice(0, -1), history: [...g.history, g.board], redo: g.redo.slice(0, -1), moveCosts: [...(g.moveCosts ?? g.history.map(() => 1)), g.redoCosts?.at(-1) ?? 1], redoCosts: (g.redoCosts ?? g.redo.map(() => 1)).slice(0, -1), moves: g.moves + (g.redoCosts?.at(-1) ?? 1) }));
    feedback('move', settings);
    clearPick(); setWinDismissed(false); announce('已重做');
  }
  function start(deal: number, masterDate?: string) {
    ++pickGeneration.current; setPickingDeal(false);
    setDifficulty(dealDifficulty(deal));
    if (!masterDate) setSettings(s => ({ ...s, nextDeal: nextPlayableDeal(deal) }));
    else if (!game.masterDate && !game.endgame && !game.special) setSettings(s => ({ ...s, nextDeal: nextPlayableDeal(game.deal) }));
    motion.cancel();
    setStats(s => abandonRun(s, game));
    setGame(newGame(deal, masterDate)); clearPick(); cancelDrag(); setPanel(null); setDealInput(''); setInputError(''); setWinDismissed(false);
    feedback('deal', settings);
    announce(`第 ${deal} 局已就绪，祝你玩得开心`);
  }
  async function startDailyMaster() {
    if (pickingDeal) return;
    const date = today();
    setDailyDate(date);
    if (game.masterDate === date && !isWon) { setPanel(null); return; }
    const token = ++pickGeneration.current;
    setPickingDeal(true);
    try {
      const deal = await dailyMasterDeal(date);
      if (pickGeneration.current === token) start(deal, date);
    } catch (error) {
      if (pickGeneration.current === token) announce(error instanceof Error ? error.message : '暂未找到大师牌局');
    } finally {
      if (pickGeneration.current === token) setPickingDeal(false);
    }
  }
  async function startEndgame(date = today(), version: NonNullable<Game['endgame']>['version'] = 3, restarting = false) {
    if (pickingDeal || (!restarting && date !== today())) return;
    setDailyDate(today());
    if (!restarting && game.endgame?.date === date && game.endgame.version === version && !isWon) { setPanel(null); return; }
    const token = ++pickGeneration.current;
    setPickingDeal(true);
    try {
      const next = await newEndgame(date, version);
      if (pickGeneration.current !== token) return;
      if (!restarting && date !== today()) { announce('日期已更新，请开始今天的残局'); return; }
      if (!game.masterDate && !game.endgame && !game.special) setSettings(s => ({ ...s, nextDeal: nextPlayableDeal(game.deal) }));
      motion.cancel();
      setStats(s => abandonRun(s, game));
      setGame(next); clearPick(); cancelDrag(); setPanel(null); setWinDismissed(false);
      feedback('deal', settings);
      announce(restarting ? '已恢复这局残局的初始牌面' : '高难残局已就绪，先规划唯一的空中转格与收牌顺序');
    } catch (error) {
      if (pickGeneration.current === token) announce(error instanceof Error ? error.message : '残局生成失败，请重试');
    } finally {
      if (pickGeneration.current === token) setPickingDeal(false);
    }
  }
  async function startSpecial(date = today(), restarting = false, kind?: DailyVariant, version: NonNullable<Game['special']>['version'] = 2) {
    if (pickingDeal || (!restarting && date !== today())) return;
    setDailyDate(today());
    if (!restarting && game.special?.date === date && game.special.version === version && (kind ? game.special.kind === kind : !isDailyVariant(game.special.kind)) && !isWon) { setPanel(null); return; }
    const token = ++pickGeneration.current;
    setPickingDeal(true);
    try {
      const next = await newSpecialGame(date, kind, version);
      if (pickGeneration.current !== token) return;
      if (!restarting && date !== today()) { announce('日期已更新，请开始今天的挑战'); return; }
      if (!game.masterDate && !game.endgame && !game.special) setSettings(s => ({ ...s, nextDeal: nextPlayableDeal(game.deal) }));
      motion.cancel(); setStats(s => abandonRun(s, game));
      setGame(next); clearPick(); cancelDrag(); setPanel(null); setWinDismissed(false);
      feedback('deal', settings);
      announce(restarting ? '已恢复这局挑战的初始牌面' : specialRuleInfo(next.special!).description);
    } catch (error) {
      if (pickGeneration.current === token) announce(error instanceof Error ? error.message : '特殊规则生成失败，请重试');
    } finally {
      if (pickGeneration.current === token) setPickingDeal(false);
    }
  }
  function restartGame() {
    // Saved puzzles keep their original date, board generation and goal version.
    if (game.special) void startSpecial(game.special.date, true, isDailyVariant(game.special.kind) ? game.special.kind : undefined, game.special.version);
    else if (game.endgame) void startEndgame(game.endgame.date, game.endgame.version, true);
    else start(game.deal, game.masterDate);
  }
  async function startNextGame() {
    if (pickingDeal) return;
    if (settings.sequential) { start(nextDeal); return; }
    const token = ++pickGeneration.current;
    setPickingDeal(true); setInputError('');
    try {
      const deal = await difficultyDeal(difficulty);
      if (pickGeneration.current === token) start(deal);
    } catch (error) {
      if (pickGeneration.current === token) setInputError(error instanceof Error ? error.message : '选取牌局失败');
    } finally {
      if (pickGeneration.current === token) setPickingDeal(false);
    }
  }
  function showHint() {
    if (paused || isWon || motion.isBusy() || verification.active.current) return;
    setGame(g => ({ ...g, achievementRun: trackAchievementAction(g, 'hint') }));
    const moves = rankedHints(game.board, { recent: game.history, held: game.held, auto: autoEnabled });
    const index = hintIndex.current++ % Math.max(1, moves.length);
    const move = moves[index];
    setSelection(null); setSuggestion(null);
    if (move) { setSuggestion(move); feedback('select', settings); announce(`${hintReason(game.board, move)}：${describeMove(game.board, move)}${moves.length > 1 ? `（${index + 1}/${moves.length}）` : ''}`); }
    else announce('当前没有可用的前进移动，可以撤销或尝试从收牌区取回一张牌');
  }
  async function verifySolvability() {
    if (paused || isWon || drag || motion.isBusy() || verification.active.current) return;
    const result = await verification.run();
    if (result) announce(result);
  }
  const { holding: holdingHint, ...hintPress } = useHintPress(showHint, verifySolvability, !paused && !isWon && !motion.busy && !drag);
  function finishGame() {
    if (paused || isWon || motion.isBusy() || !availableFinish) return;
    setGame(g => ({ ...g, achievementRun: trackAchievementAction(g, 'collect') }));
    const result = autoCollect(game.board, game.held, true);
    if (result.count) commit(result.board, `安全收起 ${result.count} 张牌`, game.held, 'collect', result.steps);
  }
  function cancelDrag() { motion.cancel(); setDrag(false); }
  function clearData() {
    const freshGame = newGame(617);
    const freshStats = settleAchievements({ ...EMPTY_STATS, xpAwards: [], completed: [], recent: [], deals: {}, challenges: {}, masters: {}, specials: {}, endgames: {} });
    const freshSettings = { ...DEFAULT_SETTINGS };
    if (!persistence.reset(freshGame, freshStats, freshSettings)) return false;
    ++pickGeneration.current; setPickingDeal(false);
    motion.cancel(); setDrag(false); clearPick();
    setGame(freshGame); setStats(freshStats); setSettings(freshSettings); setPhoto(null);
    setDifficulty(dealDifficulty(freshGame.deal)); setDealInput(''); setInputError('');
    setDismissedStuck(''); setWinDismissed(false); setPanel(null);
    announce('数据已清空，已恢复默认设置');
    return true;
  }
  function dropCard(from: Source, target: Target | null) {
    if (target && target.kind === from.kind && target.index === from.index) { clearPick(); return false; }
    const moved = !!target && perform(from, target);
    if (!moved) {
      clearPick();
      if (!target) { feedback('error', settings); announce('松手的位置不在牌区内'); }
    }
    return moved;
  }

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (verification.active.current) { event.preventDefault(); return; }
      if ((event.target as HTMLElement).matches('input, textarea')) return;
      if (event.key === 'Escape') { setPanel(null); setWinDismissed(true); setSelection(null); setSuggestion(null); cancelDrag(); return; }
      if (paused || motion.isBusy()) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (event.key.toLowerCase() === 'h' && !isWon) showHint();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const board = game.board;
  const progress = board.foundations.reduce((a, b) => a + b, 0);

  return <main className={`app ${landscape ? 'landscape-layout' : ''} ${orientation.rotated ? 'landscape-rotated' : ''} ${landscape && isTauri() ? 'native-landscape-fullscreen' : ''} ${settings.large || settings.largeText ? 'large-ranks' : ''} ${settings.largeText ? 'large-text' : ''} ${motion.busy ? 'cards-in-motion' : ''}`} style={landscape ? { '--landscape-width': `${orientation.width}px`, '--landscape-height': `${orientation.height}px` } as CSSProperties : undefined} onClick={clickBackground} onContextMenu={event => event.preventDefault()}
    onClickCapture={event => { if (verification.active.current) { event.preventDefault(); event.stopPropagation(); } }}
    onPointerDownCapture={event => { if (verification.active.current) { event.preventDefault(); event.stopPropagation(); } }}
    onKeyDownCapture={event => { if (verification.active.current) { event.preventDefault(); event.stopPropagation(); } }}>
    <div className="verification-content" inert={verifying} aria-busy={verifying}>
    <header className="header">
      <button className="player-profile" onClick={() => setPanel('stats')} aria-label={`${playerLevel.title}，等级 ${playerLevel.level}，查看等级徽章、成就和经验`}><BadgeEmblem tier={playerLevel.tier} /><span className="player-details"><span className="player-title"><b>Lv.{playerLevel.level}</b><span>{playerLevel.title}</span></span><span className="player-xp-track" role="progressbar" aria-label="等级经验" aria-valuemin={0} aria-valuemax={playerLevel.required} aria-valuenow={playerLevel.current}><span style={{ width: `${playerLevel.fraction * 100}%` }} /></span><small>{playerLevel.current} / {playerLevel.required} XP</small></span></button>
      <div className="mobile-meta"><button className="mobile-deal" aria-label={game.special ? `${specialTitle(game.special)}，${specialRuleInfo(game.special).title}，查看规则` : game.endgame ? `每日残局挑战，${endgameMode(game.endgame.kind).title}，查看目标` : `第 ${game.deal} 局，${currentDifficultyLabel}难度，查看详情`} onClick={() => setPanel('menu')}><span>{game.special ? specialTitle(game.special) : game.endgame ? '每日残局挑战' : `#${game.deal}`}</span><small>{game.special ? specialRuleInfo(game.special).title : game.endgame ? endgameMode(game.endgame.kind).title : knownUnsolvable ? '已知无解' : currentDifficultyLabel}</small></button>{landscape && <span className="landscape-moves">{game.moves} 步</span>}<button onClick={() => setPanel('pause')} aria-label={`已用时 ${time(game.seconds)}，暂停`}>{time(game.seconds)}</button></div><div className="header-actions"><button className="icon-button daily-button" aria-label="每日大师挑战" onClick={startDailyMaster}><GameplayBadge kind="daily-master" />{dailyRewardClaimed && <span className="daily-completed" />}</button><button className="icon-button menu-button" aria-label="更多" title="更多" onClick={() => setPanel('menu')}><MoreHorizontal size={22} /></button></div>
    </header>

    <section className="game-meta" aria-label="本局信息">
      <button className="deal-label" onClick={() => { setInputError(''); setPanel('new'); }}><span className="live-dot" />{game.special ? specialTitle(game.special) : game.endgame ? '每日残局挑战' : game.masterDate ? '每日大师挑战' : '经典牌局'} <span className="deal-number">{game.special ? game.special.date : game.endgame ? game.endgame.date : `#${game.deal.toString().padStart(5, '0')}`}</span><span className="deal-difficulty">{game.special ? specialRuleInfo(game.special).title : game.endgame ? endgameMode(game.endgame.kind).title : knownUnsolvable ? '已知无解' : currentDifficultyLabel}</span><ChevronRight size={14} /></button>
      <div className="counters"><button className="timer-button" onClick={() => setPanel('pause')} aria-label={`已用时 ${time(game.seconds)}，点击暂停`}>{time(game.seconds)}</button><span className="counter-divider" /><span><b key={`${game.id}-${game.moves}`} className="move-counter">{game.moves}</b> <small>步</small></span></div>
    </section>

    <PixiBoard motion={motion} board={game.board} gameId={game.id} targetColumn={game.endgame?.kind === 'clear' ? game.endgame.targetColumn : undefined} selection={verifying ? null : selection} suggestion={verifying ? null : suggestion}
      disabled={paused || isWon} paused={paused} compact={compact} landscape={landscape} rotated={orientation.rotated} cellsRight={settings.cellsRight !== false} large={settings.large} largeText={settings.largeText}
      onCard={tapCard} onTarget={chooseTarget} onBlank={cancelSelection} onHintEnd={move => { if (!verification.active.current) setSuggestion(current => current === move ? null : current); }} onDrop={dropCard}
      onDrag={(active, source) => { setDrag(active); if (active && source) { feedback('select', settings); setSelection(source); setSuggestion(null); } }} />

    <footer className="footer">
      {game.special && <div className="endgame-objective" role="status"><b>{specialTitle(game.special)} · {specialRuleInfo(game.special).title}</b><span>{specialRuleInfo(game.special).description}</span><span>{game.special.kind === 'suit-first' ? `优先花色已收 ${game.board.foundations[game.special.prioritySuit]}/13 · ` : ''}{game.special.kind === 'precision' ? `已用 ${game.moves} 步 · 当前${precisionMedal(game.special, game.moves)}区间${specialBest ? ` · 最佳 ${specialBest.bestMoves} 步` : ''}` : '52 张全部归位'} · {stats.xpAwards.includes(specialRewardKey(game.special)) || stats.specials[specialRecordKey(game.special)] ? '本日奖励已领取' : game.special.date === dailyDate ? `完成 +${SPECIAL_XP} XP${firstWinReady ? ' · 首胜翻倍' : ''}` : '往日挑战，仅记录成绩'}</span></div>}
      {game.endgame && <div className="endgame-objective" role="status"><b>{game.endgame.version >= 2 ? '高难 · ' : ''}{endgameMode(game.endgame.kind).title} · {endgameGoal(game.endgame)}</b><span>从 {game.endgame.baseRank + 1} 开始收牌 · {endgameProgress(game)}</span><span>{stats.xpAwards.includes(`endgame:${game.endgame.date}`) || stats.endgames[game.endgame.date] ? '本日奖励已领取，重玩可挑战成就' : game.endgame.date === dailyDate ? `完成 +${ENDGAME_XP} XP${firstWinReady ? ' · 今日首胜翻倍' : ''}` : '往日残局，仅记录成绩'}</span></div>}
      {game.masterDate && <div className="endgame-objective" role="status"><b>每日大师挑战 · 将 52 张牌全部归位</b><span>标准空当接龙规则 · 关键牌深埋，先规划中转空间</span><span>{stats.xpAwards.includes(`master:${game.masterDate}`) || stats.masters[game.masterDate] ? '本日奖励已领取，重玩可挑战成就' : game.masterDate === dailyDate ? `完成 +${DAILY_MASTER_XP} XP${firstWinReady ? ' · 今日首胜翻倍' : ''}` : '往日牌局，按普通对局结算'}</span></div>}
      {knownUnsolvable && <div className="board-notice" role="status"><div><b>第 {game.deal} 局已知无解</b><p>标准规则下无法通关，可以查看原始牌面，或开始下一局。</p></div></div>}
      {!knownUnsolvable && game.started && !isWon && !forwardMoves.length && dismissedStuck !== stuckKey && <div className="board-notice" role="status"><div><b>当前没有新的前进移动</b><p>{usefulMoves(board, true).length ? '可以取回收牌区顶牌重新整理，也可以撤销。' : '可以撤销之前的移动，或重玩这局。'}这不代表已经证明本局无解。</p></div><button aria-label="关闭提示" onClick={() => setDismissedStuck(stuckKey)}><X size={16} /></button></div>}
      {availableFinish && !isWon && <button className="finish-notice" disabled={paused || motion.busy} onClick={finishGame}><WandSparkles size={16} />{game.endgame ? '可安全达成残局目标，点击完成挑战' : '剩余牌可安全归位，点击完成本局'}</button>}
      {!(messageActive || saveFailed || (compact && stuck)) ? <div className="status-line" aria-hidden="true" /> : <div className={`status-line ${messageActive || saveFailed || (compact && stuck) ? 'status-active' : ''}`} aria-live="polite" title={saveFailed ? '本地保存失败，请留在当前页面继续游戏' : message}><span className="status-dot" /><span>{saveFailed ? '本地保存失败，请留在当前页面继续游戏' : compact && stuck ? '暂无新的前进移动，可撤销或在“更多”查看说明' : message}</span></div>}
      <div className="toolbar">
        <button className="new-button" onClick={() => { setInputError(''); setPanel('new'); }}><Plus size={19} /><span>新牌局</span></button>
        <span className="toolbar-divider" />
        <button className={`tool-button hint-button ${holdingHint ? 'hint-holding' : ''}`} {...hintPress} title="点击提示，长按 3 秒验证当前局面是否有解" aria-label="提示，长按 3 秒验证是否有解" disabled={paused || isWon || motion.busy}><Lightbulb /><span>{holdingHint ? '验证有解' : '提示'}</span></button>
        <button className="tool-button secondary-tool" onClick={redo} disabled={!game.redo.length || paused || isWon || motion.busy}><ArrowRight /><span>重做</span></button>
        <button className="tool-button undo-button" {...undoPress} title="点击撤销，按住连续撤销" disabled={!game.history.length || paused || isWon || (motion.busy && !holdingUndo)}><Undo2 /><span>撤销</span></button>
        {landscape && <><button className="tool-button" onClick={startDailyMaster}><GameplayBadge kind="daily-master" /><span>大师</span></button><button className="tool-button" onClick={() => setPanel('menu')}><MoreHorizontal /><span>更多</span></button></>}
      </div>
      <div className="bottom-meta"><span><ShieldCheck size={12} /> 离线单机 · 自动保存</span><div className="progress" aria-label={`已收起 ${progress} 张，共 52 张`}><span style={{ width: `${progress / 52 * 100}%` }} /></div><span>{progress}<span className="muted"> / 52</span></span></div>
    </footer>

    {winOpen && <div className="victory-particles" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <span key={i} style={{ '--particle-x': `${(i * 37 % 100)}vw`, '--particle-delay': `${i % 7 * .06}s`, '--particle-drift': `${(i % 2 ? 1 : -1) * (30 + i % 5 * 20)}px`, '--particle-turn': `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg` } as CSSProperties}>{SUITS[i % 4]}</span>)}</div>}

    {(panel || winOpen) && <div className="modal-backdrop" onClick={() => { if (winOpen) setWinDismissed(true); else setPanel(null); }}><section className={`modal modal-${winOpen ? 'win' : panel}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')).filter(item => item.getClientRects().length > 0);
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <button className="modal-close" autoFocus aria-label="关闭" onClick={() => { if (winOpen) setWinDismissed(true); else setPanel(null); }}><X size={20} /></button>
      <div className="modal-body">
      {winOpen ? <div className="dialog-layout"><div className="dialog-summary"><div className="modal-symbol victory"><Trophy size={36} /></div><p className="eyebrow">A LITTLE PATIENCE. A GREAT WIN.</p><h2 id="dialog-title">{game.endgame || game.special ? '漂亮，挑战完成。' : '漂亮，全部归位。'}</h2><p className="modal-description">{game.special ? `${game.special.date} · ${specialRuleInfo(game.special).title}` : game.endgame ? `${game.endgame.date} · ${endgameMode(game.endgame.kind).title}` : `${currentDifficultyLabel} · 第 ${game.deal} 局已完成`}</p></div><div className="dialog-content"><WinRewards stats={stats} gameId={game.id} />{game.special?.kind === 'precision' && <div className={`precision-result precision-${precisionMedal(game.special, game.moves) === '金牌' ? 'gold' : precisionMedal(game.special, game.moves) === '银牌' ? 'silver' : 'bronze'}`} role="status"><GameplayBadge kind="daily-precision" /><b>{precisionMedal(game.special, game.moves)}达成</b><span>金牌 ≤{game.special.goldMoves} 步 · 银牌 ≤{game.special.silverMoves} 步</span><span>个人最佳 {Math.min(game.moves, specialBest?.bestMoves ?? game.moves)} 步</span></div>}<div className="win-stats"><div><b>{time(game.seconds)}</b><span>用时</span></div><div><b>{game.moves}</b><span>步数</span></div><div><b>{game.special?.kind === 'precision' ? game.special.version === 1 ? 28 : 44 : game.endgame ? progress - game.endgame.baseRank * 4 : 52}</b><span>收牌</span></div></div>{game.endgame || game.special ? <button className="primary" onClick={() => { setWinDismissed(true); setPanel('new'); }}><Plus size={18} />选择新牌局</button> : <button className="primary" disabled={pickingDeal} onClick={() => void startNextGame()}><Plus size={18} />{settings.sequential ? `下一局 · #${nextDeal}` : '再来一局'}</button>}{game.special?.kind === 'precision' && <button className="secondary" disabled={pickingDeal} onClick={restartGame}>重玩，挑战更少步数</button>}<button className="secondary" onClick={() => { setWinDismissed(true); setPanel('stats'); }}>查看游戏记录</button></div></div> : <>
        {panel !== 'menu' && panel !== 'pause' && <button className="back-button" aria-label="返回更多" title="返回更多" onClick={() => setPanel('menu')}><ArrowLeft size={15} />更多</button>}
        {panel === 'menu' && <div className="dialog-layout"><div className="dialog-summary"><p className="eyebrow">TAKE YOUR TIME</p><h2 id="dialog-title">继续你的好牌局</h2><p className="modal-description">{game.special ? `${specialTitle(game.special)} · ${specialRuleInfo(game.special).title}` : game.endgame ? `每日残局挑战 · ${endgameMode(game.endgame.kind).title}` : `第 ${game.deal} 局 · ${currentDifficultyLabel}`} · {time(game.seconds)} · {game.moves} 步 · 已收 {progress}/52 张{game.masterDate && ` · 挑战 ${game.masterDate}`}</p>{compact && (messageActive || saveFailed) && <p className="notice">{saveFailed ? '本地保存失败，请留在当前页面继续游戏' : message}</p>}{knownUnsolvable && <p className="notice">第 {game.deal} 局在标准规则下已知无解，可以查看牌面或开始新牌局。</p>}{!knownUnsolvable && game.started && !isWon && !forwardMoves.length && <p className="notice">当前没有新的前进移动。可以尝试取回收牌区顶牌或撤销；这不代表已证明本局无解。</p>}</div><div className="dialog-content"><div className="menu-list">{!compact && <button onClick={() => { setInputError(''); setPanel('new'); }}><Plus /><span className="menu-label">新牌局</span><ChevronRight /></button>}<button onClick={() => { setDealInput(''); setInputError(''); setPanel('deal'); }}><ShieldCheck /><span className="menu-label">指定编号</span><ChevronRight /></button><button onClick={() => setPanel('restart')}><RotateCcw /><span className="menu-label">重玩本局</span><ChevronRight /></button><button onClick={() => setPanel('stats')}><Trophy /><span className="menu-label">成就与记录</span><ChevronRight /></button><button onClick={() => setPanel('settings')}><Settings2 /><span className="menu-label">偏好设置</span><ChevronRight /></button><button onClick={() => setPanel('rules')}><CircleHelp /><span className="menu-label">玩法说明</span><ChevronRight /></button></div></div></div>}
        {panel === 'new' && <div className="dialog-layout new-game-dialog">
          <div className="dialog-summary">
            <h2 id="dialog-title">新牌局</h2>
            <div className={`new-game-first-win ${firstWinReady ? 'reward-available' : 'reward-claimed'}`} role="status">
              <Sparkles size={16} /><span>{firstWinReady ? '今日首胜 · 基础 XP ×2' : '✓ 今日首胜已领取'}</span>
            </div>
          </div>
          <div className="dialog-content">
            {!settings.sequential && <div className="difficulty-grid" role="group" aria-label="牌局难度">{DIFFICULTIES.map(item => {
              const reward = difficultyReward(stats, item.id, dailyDate);
              return <button key={item.id} title={`${item.description} · 今日已完成 ${reward.wins} 局，下一局基础奖励 ${reward.xp} XP`} disabled={pickingDeal} aria-pressed={difficulty === item.id} onClick={() => setDifficulty(item.id)}><GameplayBadge kind={item.id} /><span className="difficulty-copy"><b>{item.label}</b><small className={firstWinReady ? 'double-xp' : ''}>+{reward.xp * (firstWinReady ? 2 : 1)} XP</small></span></button>;
            })}</div>}
            <p className="fine-print">四档难度分别累计，每通关一局，该难度下一局增加一份基础经验；每天重置。首胜与速度奖励额外叠加。</p>
            <button className="primary" disabled={pickingDeal} onClick={() => void startNextGame()}><Plus size={18} />{pickingDeal ? '正在选取牌局…' : settings.sequential ? `开始下一局 · #${nextDeal}` : `开始${difficultyInfo(difficulty).label}牌局`}</button>

            {game.started && !isWon && <p className="new-game-warning">{game.endgame || game.special ? '新牌局会替换当前挑战进度。' : '新牌局会替换当前进度，并中断连胜。'}</p>}
            <section className="new-game-dailies" aria-label="每日玩法与经验奖励">
              <h3>每日玩法</h3>
              <button className={`daily-game-entry ${dailyRewardClaimed ? 'reward-claimed' : ''}`} disabled={pickingDeal} onClick={startDailyMaster}>
                <GameplayBadge kind="daily-master" />
                <span className="daily-game-copy"><b>每日大师挑战</b><small>{pickingDeal ? '正在准备挑战牌面…' : dailyRewardClaimed ? '今日挑战奖励已领取' : '标准规则 · 难度高于专家'}</small></span>
                <span className="daily-game-reward">{dailyRewardClaimed ? <strong>已领取</strong> : <><strong>+{DAILY_MASTER_XP * (firstWinReady ? 2 : 1)} XP</strong><small>{firstWinReady ? '含今日首胜' : '每日奖励'}</small></>}</span>
                <ChevronRight size={16} />
              </button>
              <button className={`daily-game-entry ${endgameRewardClaimed ? 'reward-claimed' : ''}`} disabled={pickingDeal} onClick={() => startEndgame()}>
                <GameplayBadge kind="daily-endgame" />
                <span className="daily-game-copy"><b>每日残局挑战</b><small>{pickingDeal ? '正在准备挑战牌面…' : endgameRewardClaimed ? '今日残局奖励已领取' : '深度交叉阻挡 · 仅一个空中转格'}</small></span>
                <span className="daily-game-reward">{endgameRewardClaimed ? <strong>已领取</strong> : <><strong>+{ENDGAME_XP * (firstWinReady ? 2 : 1)} XP</strong><small>{firstWinReady ? '含今日首胜' : '每日奖励'}</small></>}</span>
                <ChevronRight size={16} />
              </button>
              <button className={`daily-game-entry ${specialRewardClaimed ? 'reward-claimed' : ''}`} disabled={pickingDeal} onClick={() => startSpecial()}>
                <GameplayBadge kind="daily-special" />
                <span className="daily-game-copy"><b>每日特殊规则</b><small>{pickingDeal ? '正在准备挑战牌面…' : specialRewardClaimed ? '今日奖励已领取' : specialRuleInfo(dailySpecial(dailyDate)).title}</small></span>
                <span className="daily-game-reward">{specialRewardClaimed ? <strong>已领取</strong> : <><strong>+{SPECIAL_XP * (firstWinReady ? 2 : 1)} XP</strong><small>{firstWinReady ? '含今日首胜' : '每日奖励'}</small></>}</span>
                <ChevronRight size={16} />
              </button>
              {DAILY_VARIANTS.map(kind => {
                const challenge = { kind, prioritySuit: 0, version: 2 as const, date: dailyDate };
                const saved = stats.specials[specialRecordKey(challenge)];
                const best = saved?.version === challenge.version ? saved : undefined;
                const claimed = !!saved || stats.xpAwards.includes(specialRewardKey(challenge));
                const description = kind === 'precision' ? '44 张牌 · 挑战目标步数' : kind === 'same-suit' ? '同花递减 · 深埋关键牌' : '逆序递增 · 交叉阻挡';
                return <button key={kind} className={`daily-game-entry ${claimed ? 'reward-claimed' : ''}`} disabled={pickingDeal} onClick={() => startSpecial(today(), false, kind)}>
                  <GameplayBadge kind={`daily-${kind}`} />
                  <span className="daily-game-copy"><b>{specialTitle(challenge)}</b><small>{pickingDeal ? '正在准备挑战牌面…' : best ? `${kind === 'precision' ? `${precisionMedal(best, best.bestMoves)} · ` : ''}最佳 ${best.bestMoves} 步` : description}</small></span>
                  <span className="daily-game-reward">{claimed ? <strong>已领取</strong> : <><strong>+{SPECIAL_XP * (firstWinReady ? 2 : 1)} XP</strong><small>{firstWinReady ? '含今日首胜' : '每日奖励'}</small></>}</span>
                  <ChevronRight size={16} />
                </button>;
              })}
              <p>每种玩法的每日奖励每天领取一次，首胜由所有玩法共用。</p>
            </section>
          </div>
        </div>}
        {panel === 'deal' && <div className="dialog-layout">
          <div className="dialog-summary"><h2 id="dialog-title">指定编号</h2></div>
          <div className="dialog-content">
            <form className="numbered-deal-form" onSubmit={event => { event.preventDefault(); const n = Number(dealInput); if (!/^\d+$/.test(dealInput) || !validDeal(n)) { setInputError('请输入 1 至 9,999,999 之间的整数'); return; } start(n); }}>
              <label className="input-label" htmlFor="deal-input">指定编号</label>
              <div className="deal-input"><span>#</span><input id="deal-input" inputMode="numeric" pattern="[0-9]*" placeholder={DEAL_RANGE_LABEL} maxLength={7} value={dealInput} onChange={event => { setDealInput(event.target.value); setInputError(''); }} aria-describedby="deal-error" /><button type="submit" aria-label="开始指定编号牌局"><ArrowRight size={20} /></button></div>
              <p id="deal-error" className="input-error" aria-live="polite">{inputError || (isUnsolvableDeal(Number(dealInput)) ? '此编号已知无解，仍可开始查看原始牌面。' : '')}</p>
            </form>
            {game.started && !isWon && <p className="new-game-warning">{game.endgame || game.special ? '新牌局会替换当前挑战进度。' : '新牌局会替换当前进度，并中断连胜。'}</p>}
          </div>
        </div>}
        {panel === 'restart' && <div className="dialog-layout"><div className="dialog-summary"><div className="modal-symbol"><RotateCcw /></div><h2 id="dialog-title">{game.special ? `重玩${specialTitle(game.special)}？` : game.endgame ? '重玩这局残局？' : `重玩第 ${game.deal} 局？`}</h2><p className="modal-description">恢复这局最初的牌面，步数和计时归零。{game.endgame || game.special ? '重复完成不重复领奖。' : '未完成的牌局会中断连胜。'}</p></div><div className="dialog-content"><button className="primary" onClick={restartGame}>重玩本局</button><button className="secondary" onClick={() => setPanel(null)}>继续当前牌局</button></div></div>}
        {panel === 'pause' && <div className="dialog-layout"><div className="dialog-summary"><div className="modal-symbol"><Flag /></div><p className="eyebrow">NO NEED TO RUSH</p><h2 id="dialog-title">休息一下</h2><p className="modal-description">计时已暂停，你的牌局就在这里。</p></div><div className="dialog-content"><div className="pause-time">{time(game.seconds)}</div><button className="primary" onClick={() => setPanel(null)}><Play size={18} />继续游戏</button></div></div>}
        {panel === 'rules' && <div className="dialog-layout"><div className="dialog-summary"><p className="eyebrow">THE ART OF MAKING ROOM</p><h2 id="dialog-title">一点空间，很多可能</h2></div><div className="dialog-content"><div className="rules">{game.endgame && <div><span>★</span><p><b>{endgameMode(game.endgame.kind).title}</b>{endgameGoal(game.endgame)}。从 {game.endgame.baseRank + 1} 开始收牌。当前进度：{endgameProgress(game)}。</p></div>}{game.masterDate && <div><span>★</span><p><b>每日大师挑战</b>标准空当接龙规则，将 52 张牌全部归位。关键牌深埋，先规划中转空间。</p></div>}{game.special && <div><span>★</span><p><b>{specialTitle(game.special)}</b>{specialRuleInfo(game.special).description}</p></div>}<div><span>01</span><p><b>{game.special?.kind === 'same-suit' ? '同花色，依次递减' : game.special?.kind === 'reverse' ? '红黑交替，依次递增' : '红黑交替，依次递减'}</b>{game.special?.kind === 'same-suit' ? '例如把 ♠6 放到 ♠7 上，不同花色不能叠放。' : game.special?.kind === 'reverse' ? '例如把红色 7 放到黑色 6 上。' : '八列牌中，把红色 6 放到黑色 7 上。'}连续有序的牌可以一起搬动。</p></div><div><span>02</span><p><b>中转格，每格一张</b>四个格子用于临时放牌。空列可以放任意牌，不必从 K 开始。</p></div><div><span>03</span><p><b>腾出空间，搬更多牌</b>最多可搬张数 =（空中转格 + 1）× 2 的空列数次方。目的地为空列时不计入空列数。</p></div><div><span>04</span><p><b>{game.special?.kind === 'reverse' ? '从 K 到 A，全部归位' : '从 A 到 K，全部归位'}</b>同花色按{game.special?.kind === 'reverse' ? '递减' : '递增'}顺序移到对应收牌区。52 张全部收起即获胜；需要时也可以取回收牌区顶牌。</p></div></div><div className="notice">点牌再点目的地，或直接拖动。移动端单击露出的单张牌即可收牌；桌面端先选牌，再次点击尝试移动。不能收牌时可点选目的地或拖动；再次点击已选牌可尝试移入空中转格，牌组有唯一落点时自动移动。设置中可开启单击便捷移动；多个落点时仍由你选择。取回的牌暂不自动收起，可手动移回收牌区。连续点提示可查看其他建议，提示不保证通关。长按提示 3 秒可验证当前局面是否有解，快速演示后自动恢复牌面；验证期间无法操作，计时暂停。</div><button className="primary" onClick={() => setPanel(null)}>开始享受牌局</button></div></div>}
        {panel === 'settings' && <SettingsPanel settings={settings} update={next => { setSettings(next); if (next.auto && game.started) setGame(g => ({ ...g, achievementRun: trackAchievementAction(g, 'auto') })); }} photo={photo} setPhoto={setPhoto} clearData={clearData} close={() => setPanel(null)} />}
        {panel === 'stats' && <StatsPanel stats={stats} largeText={settings.largeText} game={game} start={start} startSpecial={startSpecial} startEndgame={startEndgame} close={() => setPanel(null)} />}

      </>}
      </div>
    </section></div>}
    </div>
    {verification.state && <div className={`verification-overlay verification-${verification.state.phase}`}>
      <div className={`verification-status ${verification.state.outcome ? `verification-${verification.state.outcome}` : ''}`} role="status" aria-live="polite" aria-atomic="true">
        <span className="verification-icon" aria-hidden="true">{verification.state.phase === 'result' ? verification.state.outcome === 'solved' ? <ShieldCheck size={22} /> : <CircleHelp size={22} /> : <Sparkles size={22} />}</span>
        <b>{verification.state.title}</b><span>{verification.state.detail}</span>
      </div>
    </div>}
  </main>;
}
