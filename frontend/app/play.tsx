import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  TextInput,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Audio } from "expo-av";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const NEON_PINK = "#FF007F";
const NEON_CYAN = "#00F0FF";
const POP_YELLOW = "#FFD700";
const POP_ORANGE = "#FF4500";
const BG_DEEP = "#110B17";
const BG_PURPLE = "#2D004E";
const GOOD_GREEN = "#22E06B";

const LANES = 3;
const LANE_WIDTH = Math.min(SCREEN_W, 520) / LANES;
const GAME_W = LANE_WIDTH * LANES;
const PLAY_H = Math.min(SCREEN_H * 0.72, 760);
const PLAYER_SIZE = 64;
const OBSTACLE_SIZE = 58;
const PLAYER_Y = PLAY_H - PLAYER_SIZE - 28;

type Obstacle = {
  id: number;
  lane: number; // 0..2
  y: number;
  kind: "hammer" | "cart";
  emoji: string;
  scored: boolean;
};

type ScoreEntry = {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
};

// Free SFX (short MP3, public CDN)
const SFX_POW =
  "https://cdn.jsdelivr.net/gh/naptha/tesseract.js@master/tests/sample.mp3"; // fallback — replaced at runtime if fails
const SFX_BOOM = SFX_POW;
const SFX_WHOOSH = SFX_POW;

// Use Web Audio API on web for instant, reliable SFX
function playWebTone(freq: number, duration = 0.12, type: OscillatorType = "square") {
  if (Platform.OS !== "web") return;
  try {
    // @ts-ignore
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    // @ts-ignore store shared ctx on window
    const ctx: AudioContext = (window as any).__chaosAudio || ((window as any).__chaosAudio = new AC());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch (_) {}
}

function sfxPow() {
  if (Platform.OS === "web") {
    playWebTone(880, 0.08, "square");
    setTimeout(() => playWebTone(660, 0.1, "square"), 60);
  } else {
    // native fallback — silent
  }
}
function sfxNearMiss() {
  if (Platform.OS === "web") playWebTone(540, 0.06, "sine");
}
function sfxBoom() {
  if (Platform.OS === "web") {
    playWebTone(140, 0.3, "sawtooth");
    setTimeout(() => playWebTone(90, 0.4, "sawtooth"), 90);
  }
}
function sfxMilestone() {
  if (Platform.OS === "web") {
    playWebTone(660, 0.08, "triangle");
    setTimeout(() => playWebTone(880, 0.08, "triangle"), 70);
    setTimeout(() => playWebTone(1040, 0.12, "triangle"), 140);
  }
}

export default function Play() {
  const router = useRouter();
  const [phase, setPhase] = useState<"ready" | "playing" | "gameover">("ready");
  const [lane, setLane] = useState(1);
  const [score, setScore] = useState(0);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [speed, setSpeed] = useState(4);
  const [playerName, setPlayerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [loadingLb, setLoadingLb] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const laneRef = useRef(lane);
  const obsRef = useRef<Obstacle[]>([]);
  const speedRef = useRef(speed);
  const scoreRef = useRef(0);
  const phaseRef = useRef(phase);
  const spawnTimerRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastMilestoneRef = useRef(0);
  const obsIdRef = useRef(1);

  useEffect(() => { laneRef.current = lane; }, [lane]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const fetchLeaderboard = useCallback(async () => {
    setLoadingLb(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/scores/top?limit=10`);
      const data = await res.json();
      setLeaderboard((data?.scores ?? []) as ScoreEntry[]);
    } catch (_) {
      setLeaderboard([]);
    } finally {
      setLoadingLb(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Enable web audio on first user interaction (Chrome/Safari autoplay policy)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unlock = () => {
      // @ts-ignore
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC && !(window as any).__chaosAudio) {
        try { (window as any).__chaosAudio = new AC(); } catch {}
      }
      if ((window as any).__chaosAudio?.state === "suspended") {
        (window as any).__chaosAudio.resume();
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Set expo-av audio mode on native
  useEffect(() => {
    if (Platform.OS !== "web") {
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      }).catch(() => {});
    }
  }, []);

  // Keyboard controls (web)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== "playing") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        setLane((l) => Math.max(0, l - 1));
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        setLane((l) => Math.min(LANES - 1, l + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startGame = () => {
    setScore(0);
    scoreRef.current = 0;
    setLane(1);
    laneRef.current = 1;
    setObstacles([]);
    obsRef.current = [];
    setSpeed(4);
    speedRef.current = 4;
    spawnTimerRef.current = 0;
    lastMilestoneRef.current = 0;
    obsIdRef.current = 1;
    setSubmitted(false);
    setPlayerName("");
    setPhase("playing");
  };

  const endGame = useCallback(() => {
    phaseRef.current = "gameover";
    setPhase("gameover");
    sfxBoom();
  }, []);

  // Game loop
  useEffect(() => {
    if (phase !== "playing") {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const secs = dt / 1000;

      // Score = time survived * 10
      scoreRef.current += secs * 10;
      setScore(Math.floor(scoreRef.current));

      // Ramp speed
      speedRef.current = Math.min(14, 4 + scoreRef.current / 120);

      // Milestone sfx every 100 points
      const milestone = Math.floor(scoreRef.current / 100);
      if (milestone > lastMilestoneRef.current) {
        lastMilestoneRef.current = milestone;
        sfxMilestone();
      }

      // Spawn obstacles
      spawnTimerRef.current += dt;
      const spawnEvery = Math.max(380, 900 - scoreRef.current * 1.5);
      if (spawnTimerRef.current > spawnEvery) {
        spawnTimerRef.current = 0;
        const laneIdx = Math.floor(Math.random() * LANES);
        const kind: "hammer" | "cart" = Math.random() < 0.5 ? "hammer" : "cart";
        obsRef.current.push({
          id: obsIdRef.current++,
          lane: laneIdx,
          y: -OBSTACLE_SIZE - 10,
          kind,
          emoji: kind === "hammer" ? "🔨" : "🛒",
          scored: false,
        });
      }

      // Move obstacles
      const curLane = laneRef.current;
      let collided = false;
      for (const o of obsRef.current) {
        o.y += speedRef.current * (dt / 16);
        // Near-miss SFX when passing player level
        if (!o.scored && o.y > PLAYER_Y - 4 && o.y < PLAYER_Y + PLAYER_SIZE) {
          if (o.lane !== curLane) {
            sfxNearMiss();
          } else {
            collided = true;
          }
          o.scored = true;
        }
      }
      // Remove off-screen
      obsRef.current = obsRef.current.filter((o) => o.y < PLAY_H + 40);
      setObstacles([...obsRef.current]);

      if (collided) {
        sfxPow();
        endGame();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [phase, endGame]);

  const tapLeft = () => {
    if (phaseRef.current !== "playing") return;
    setLane((l) => Math.max(0, l - 1));
  };
  const tapRight = () => {
    if (phaseRef.current !== "playing") return;
    setLane((l) => Math.min(LANES - 1, l + 1));
  };

  const submitScore = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const name = (playerName || "ANON").trim().toUpperCase().slice(0, 12);
      const res = await fetch(`${BACKEND_URL}/api/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_name: name, score }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      setSubmitted(true);
      await fetchLeaderboard();
    } catch (e) {
      // non-fatal: still show the board
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root} testID="play-screen">
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Top HUD */}
        <View style={styles.hud}>
          <TouchableOpacity
            testID="back-to-home-button"
            onPress={() => router.push('/')}
            style={styles.hudBtn}
          >
            <Text style={styles.hudBtnText}>{"‹ HOME"}</Text>
          </TouchableOpacity>
          <View style={styles.scoreChip} testID="score-chip">
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>
          <View style={[styles.hudBtn, { backgroundColor: POP_YELLOW }]}>
            <Text style={[styles.hudBtnText, { color: BG_DEEP }]}>
              x{speed.toFixed(1)}
            </Text>
          </View>
        </View>

        {/* Game Field */}
        <View style={styles.fieldWrap}>
          <View style={styles.field} testID="game-field">
            {/* Lane dividers */}
            {[1, 2].map((i) => (
              <View
                key={i}
                style={[styles.laneDivider, { left: i * LANE_WIDTH - 1 }]}
              />
            ))}
            {/* Road stripes */}
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={`stripe-${i}`}
                style={[
                  styles.roadStripe,
                  { top: (i * PLAY_H) / 8, left: GAME_W / 2 - 3 },
                ]}
              />
            ))}

            {/* Obstacles */}
            {obstacles.map((o) => (
              <View
                key={o.id}
                testID={`obstacle-${o.kind}-${o.id}`}
                style={[
                  styles.obstacle,
                  {
                    left: o.lane * LANE_WIDTH + (LANE_WIDTH - OBSTACLE_SIZE) / 2,
                    top: o.y,
                    backgroundColor: o.kind === "hammer" ? NEON_PINK : NEON_CYAN,
                  },
                ]}
              >
                <Text style={styles.obstacleEmoji}>{o.emoji}</Text>
              </View>
            ))}

            {/* Player */}
            <View
              testID="player"
              style={[
                styles.player,
                {
                  left: lane * LANE_WIDTH + (LANE_WIDTH - PLAYER_SIZE) / 2,
                  top: PLAYER_Y,
                },
              ]}
            >
              <Text style={styles.playerEmoji}>🏃</Text>
            </View>

            {/* Tap zones for left/right */}
            {phase === "playing" && (
              <>
                <TouchableOpacity
                  testID="tap-left-zone"
                  activeOpacity={1}
                  style={[styles.tapZone, { left: 0 }]}
                  onPress={tapLeft}
                />
                <TouchableOpacity
                  testID="tap-right-zone"
                  activeOpacity={1}
                  style={[styles.tapZone, { right: 0 }]}
                  onPress={tapRight}
                />
              </>
            )}

            {/* Ready overlay */}
            {phase === "ready" && (
              <View style={styles.overlay} testID="ready-overlay">
                <Text style={styles.overlayTitle}>READY?</Text>
                <Text style={styles.overlaySub}>
                  Dodge the hammers 🔨 and shopping carts 🛒
                </Text>
                <Text style={styles.overlaySub}>
                  Tap L/R (or ← →) to switch lanes
                </Text>
                <TouchableOpacity
                  testID="start-game-button"
                  style={styles.bigBtn}
                  onPress={startGame}
                >
                  <Text style={styles.bigBtnText}>START CHAOS</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Game over overlay */}
            {phase === "gameover" && (
              <View style={styles.overlay} testID="gameover-overlay">
                <Text style={styles.boomText}>BOOM!</Text>
                <Text style={styles.finalScore} testID="final-score">
                  {score}
                </Text>
                <Text style={styles.overlaySub}>Your chaos score</Text>

                {!submitted ? (
                  <View style={styles.nameRow}>
                    <TextInput
                      testID="player-name-input"
                      value={playerName}
                      onChangeText={(t) => setPlayerName(t.toUpperCase().slice(0, 12))}
                      placeholder="YOUR NAME"
                      placeholderTextColor="#FFFFFFAA"
                      style={styles.nameInput}
                      maxLength={12}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity
                      testID="submit-score-button"
                      style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                      disabled={submitting}
                      onPress={submitScore}
                    >
                      {submitting ? (
                        <ActivityIndicator color={BG_DEEP} />
                      ) : (
                        <Text style={styles.submitBtnText}>SAVE</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.savedBadge} testID="score-saved-badge">
                    <Text style={styles.savedText}>✓ SCORE SAVED</Text>
                  </View>
                )}

                <View style={styles.overBtnRow}>
                  <TouchableOpacity
                    testID="retry-button"
                    style={[styles.bigBtn, { backgroundColor: NEON_CYAN }]}
                    onPress={startGame}
                  >
                    <Text style={[styles.bigBtnText, { color: BG_DEEP }]}>RETRY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="home-from-gameover-button"
                    style={[styles.bigBtn, { backgroundColor: POP_YELLOW }]}
                    onPress={() => router.push('/')}
                  >
                    <Text style={[styles.bigBtnText, { color: BG_DEEP }]}>HOME</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Leaderboard */}
        <View style={styles.lbWrap} testID="leaderboard">
          <View style={styles.lbHeader}>
            <Text style={styles.lbTitle}>🏆 TOP CHAOS LEGENDS</Text>
            <TouchableOpacity
              testID="refresh-leaderboard-button"
              onPress={fetchLeaderboard}
              style={styles.refreshBtn}
            >
              <Text style={styles.refreshText}>↻</Text>
            </TouchableOpacity>
          </View>
          {loadingLb ? (
            <ActivityIndicator color={POP_YELLOW} />
          ) : leaderboard.length === 0 ? (
            <Text style={styles.lbEmpty}>
              No scores yet. Be the first legend.
            </Text>
          ) : (
            <FlatList
              data={leaderboard}
              keyExtractor={(it) => it.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 8 }}
              renderItem={({ item, index }) => (
                <View
                  style={[
                    styles.lbItem,
                    index === 0 && { backgroundColor: POP_YELLOW },
                    index === 1 && { backgroundColor: NEON_CYAN },
                    index === 2 && { backgroundColor: POP_ORANGE },
                  ]}
                  testID={`lb-entry-${index}`}
                >
                  <Text
                    style={[
                      styles.lbRank,
                      index < 3 && { color: BG_DEEP },
                    ]}
                  >
                    #{index + 1}
                  </Text>
                  <Text
                    style={[
                      styles.lbName,
                      index < 3 && { color: BG_DEEP },
                    ]}
                    numberOfLines={1}
                  >
                    {item.player_name}
                  </Text>
                  <Text
                    style={[
                      styles.lbScore,
                      index < 3 && { color: BG_DEEP },
                    ]}
                  >
                    {item.score}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_DEEP },
  safe: { flex: 1 },

  hud: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  hudBtn: {
    backgroundColor: NEON_PINK,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hudBtnText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 1,
    fontSize: 12,
  },
  scoreChip: {
    flex: 1,
    backgroundColor: BG_PURPLE,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  scoreLabel: {
    color: POP_YELLOW,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 2,
  },
  scoreValue: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: 1,
  },

  // Field
  fieldWrap: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
  },
  field: {
    width: GAME_W,
    height: PLAY_H,
    backgroundColor: "#1A0D26",
    borderWidth: 4,
    borderColor: "#000",
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  laneDivider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  roadStripe: {
    position: "absolute",
    width: 6,
    height: 30,
    backgroundColor: "rgba(255,215,0,0.25)",
    borderRadius: 3,
  },
  obstacle: {
    position: "absolute",
    width: OBSTACLE_SIZE,
    height: OBSTACLE_SIZE,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  obstacleEmoji: { fontSize: 32 },
  player: {
    position: "absolute",
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    borderRadius: 16,
    backgroundColor: GOOD_GREEN,
    borderWidth: 3,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  playerEmoji: { fontSize: 36 },
  tapZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "50%",
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,11,23,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 8,
  },
  overlayTitle: {
    color: "#fff",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: 3,
    textShadowColor: NEON_PINK,
    textShadowRadius: 0,
    textShadowOffset: { width: 3, height: 3 },
  },
  overlaySub: {
    color: "#FFFFFFCC",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "700",
  },
  bigBtn: {
    backgroundColor: NEON_PINK,
    borderWidth: 4,
    borderColor: "#000",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 12,
    minWidth: 140,
    alignItems: "center",
  },
  bigBtnText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 16,
  },
  boomText: {
    color: POP_ORANGE,
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 4,
    textShadowColor: POP_YELLOW,
    textShadowOffset: { width: 3, height: 3 },
  },
  finalScore: {
    color: POP_YELLOW,
    fontSize: 72,
    fontWeight: "900",
    letterSpacing: 3,
    marginTop: -4,
  },
  nameRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  nameInput: {
    backgroundColor: BG_PURPLE,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 16,
    minWidth: 160,
  },
  submitBtn: {
    backgroundColor: POP_YELLOW,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 74,
  },
  submitBtnText: {
    color: BG_DEEP,
    fontWeight: "900",
    letterSpacing: 1,
  },
  savedBadge: {
    marginTop: 10,
    backgroundColor: GOOD_GREEN,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  savedText: { color: BG_DEEP, fontWeight: "900", letterSpacing: 2 },
  overBtnRow: { flexDirection: "row", gap: 10 },

  // Leaderboard
  lbWrap: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lbHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lbTitle: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 14,
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG_PURPLE,
    borderWidth: 2,
    borderColor: "#000",
  },
  refreshText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  lbEmpty: { color: "#FFFFFF88", fontSize: 12, fontStyle: "italic" },
  lbItem: {
    minWidth: 110,
    backgroundColor: BG_PURPLE,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  lbRank: {
    color: POP_YELLOW,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1,
  },
  lbName: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1,
  },
  lbScore: {
    color: NEON_CYAN,
    fontWeight: "900",
    fontSize: 18,
  },
});
