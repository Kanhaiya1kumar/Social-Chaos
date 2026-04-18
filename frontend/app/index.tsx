import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
  Alert,
  Image,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Fallback hero art — shows instantly on load
const DEFAULT_HERO =
  "https://static.prod-images.emergentagent.com/jobs/80cfbec6-67ce-4b66-b1d8-ebd7fa33fe8d/images/74c6378d47fc3c930dcd200856271fffb7ef315d16dd808aa6fcaa22021d842b.png";
const CHAR_BANANA =
  "https://static.prod-images.emergentagent.com/jobs/80cfbec6-67ce-4b66-b1d8-ebd7fa33fe8d/images/85a26cd97c0e2e7c6259b4fd770b48cf6e02efe74571612f9e3aea9420c967e7.png";
const CHAR_ROCKET =
  "https://static.prod-images.emergentagent.com/jobs/80cfbec6-67ce-4b66-b1d8-ebd7fa33fe8d/images/1d8f6e5532c10e3152f803299bb3576d6e11ce97aa6a45daecb025d0812e9c30.png";

const NEON_PINK = "#FF007F";
const NEON_CYAN = "#00F0FF";
const POP_YELLOW = "#FFD700";
const POP_ORANGE = "#FF4500";
const POP_PURPLE = "#B83DFF";
const BG_DEEP = "#110B17";
const BG_PURPLE = "#2D004E";

type Character = {
  id: string;
  name: string;
  tag: string;
  color: string;
  image?: string;
  emoji?: string;
};

const ROSTER: Character[] = [
  { id: "banana", name: "Banana Bro", tag: "Slippery", color: POP_YELLOW, image: CHAR_BANANA },
  { id: "rocket", name: "Rocket Rico", tag: "Explosive", color: POP_ORANGE, image: CHAR_ROCKET },
  { id: "hammer", name: "Hammer Hana", tag: "Smashy", color: NEON_PINK, emoji: "🔨" },
  { id: "cart", name: "Cart Kai", tag: "Reckless", color: NEON_CYAN, emoji: "🛒" },
  { id: "bomb", name: "Bomb Bea", tag: "Boomy", color: POP_PURPLE, emoji: "💣" },
];

// ---------- Title ----------
function TitleWord({ word }: { word: string }) {
  return (
    <View style={styles.titleWord}>
      <Text style={[styles.titleShadowCyan, styles.titleShadowPos1]}>{word}</Text>
      <Text style={[styles.titleShadowPink, styles.titleShadowPos2]}>{word}</Text>
      <Text style={styles.titleMain}>{word}</Text>
    </View>
  );
}

function AnimatedTitle() {
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0.85);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 140 });
    rotate.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(2, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }, { scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.titleWrap, style]} testID="social-chaos-title">
      <TitleWord word="SOCIAL" />
      <View style={{ height: 2 }} />
      <TitleWord word="CHAOS" />
    </Animated.View>
  );
}

// ---------- Burst Badge ----------
function BurstBadge({
  label,
  color,
  rotate,
  top,
  left,
  right,
  delay = 0,
  testID,
}: {
  label: string;
  color: string;
  rotate: number;
  top?: number;
  left?: number;
  right?: number;
  delay?: number;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    const t = setTimeout(() => {
      scale.value = withSequence(
        withSpring(1.15, { damping: 5, stiffness: 220 }),
        withSpring(1, { damping: 6, stiffness: 180 }),
      );
    }, delay);
    return () => clearTimeout(t);
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate}deg` }],
  }));
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.burstBadge,
        { backgroundColor: color, top, left, right },
        style,
      ]}
    >
      <Text style={styles.burstText}>{label}</Text>
    </Animated.View>
  );
}

// ---------- Comic Button ----------
function ComicButton({
  label,
  onPress,
  bg,
  fg,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  bg: string;
  fg: string;
  disabled?: boolean;
  testID?: string;
}) {
  const offset = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { translateY: offset.value }],
  }));
  return (
    <Animated.View style={[styles.btnOuter, style, disabled && { opacity: 0.75 }]}>
      <TouchableOpacity
        testID={testID}
        disabled={disabled}
        activeOpacity={0.95}
        onPressIn={() => (offset.value = withTiming(3, { duration: 80 }))}
        onPressOut={() => (offset.value = withTiming(0, { duration: 120 }))}
        onPress={onPress}
        style={[styles.btnInner, { backgroundColor: bg }]}
      >
        <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------- Roster Card ----------
function RosterCard({ item, index }: { item: Character; index: number }) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  useEffect(() => {
    const t = setTimeout(() => {
      scale.value = withSequence(
        withSpring(1.12, { damping: 5, stiffness: 220 }),
        withSpring(1, { damping: 6, stiffness: 180 }),
      );
      rotate.value = withSequence(
        withSpring(-6, { damping: 5, stiffness: 220 }),
        withSpring(0, { damping: 6, stiffness: 180 }),
      );
    }, 200 + index * 80);
    return () => clearTimeout(t);
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  return (
    <Animated.View
      testID={`roster-card-${item.id}`}
      style={[styles.rosterCard, style]}
    >
      <View style={[styles.rosterThumb, { backgroundColor: item.color }]}>
        {item.image ? (
          Platform.OS === "web" ? (
            <View
              // @ts-ignore — web-only style
              style={[
                styles.rosterImg,
                { backgroundImage: `url(${item.image})`, backgroundSize: "cover", backgroundPosition: "center" },
              ]}
            />
          ) : (
            <Image
              source={{ uri: item.image }}
              style={styles.rosterImg}
              resizeMode="cover"
            />
          )
        ) : (
          <Text style={styles.rosterEmoji}>{item.emoji}</Text>
        )}
      </View>
      <Text style={styles.rosterName} numberOfLines={1}>
        {item.name}
      </Text>
      <View style={styles.rosterTag}>
        <Text style={styles.rosterTagText}>{item.tag}</Text>
      </View>
    </Animated.View>
  );
}

// ---------- Main ----------
export default function Index() {
  const [heroUri, setHeroUri] = useState<string>(DEFAULT_HERO);
  const [generating, setGenerating] = useState(false);
  const [caption, setCaption] = useState<string>("Official Key Art");
  const router = useRouter();

  const regenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-keyart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant: "fresh chaos" }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      if (data?.image_base64) {
        setHeroUri(data.image_base64);
        setCaption(data.caption || "Freshly generated chaos");
      } else {
        throw new Error("No image in response");
      }
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      if (Platform.OS === "web") {
        // @ts-ignore
        if (typeof window !== "undefined") window.alert(`Generation failed: ${msg}`);
      } else {
        Alert.alert("Generation failed", msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const play = () => {
    router.push("/play");
  };

  return (
    <View style={styles.root} testID="social-chaos-screen">
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* ----- HERO (flex: 1, fills available space) ----- */}
        <View style={styles.heroWrap}>
          {Platform.OS === "web" ? (
            <View
              testID="hero-key-art-image"
              // @ts-ignore — web-only style
              style={[
                styles.heroImg,
                { backgroundImage: `url(${heroUri})`, backgroundSize: "cover", backgroundPosition: "center" },
              ]}
            />
          ) : (
            <Image
              testID="hero-key-art-image"
              source={{ uri: heroUri }}
              style={styles.heroImg}
              resizeMode="cover"
            />
          )}
          <View style={styles.heroTopFade} />
          <View style={styles.heroBottomFade} />

          {/* Top chips */}
          <View style={styles.topBar}>
            <View style={styles.liveDot}>
              <View style={styles.liveDotInner} />
              <Text style={styles.liveText}>PRE-SEASON</Text>
            </View>
            <View style={[styles.liveDot, { backgroundColor: POP_YELLOW }]}>
              <Text style={[styles.liveText, { color: BG_DEEP }]}>v0.1 BETA</Text>
            </View>
          </View>

          {/* Bursts */}
          <BurstBadge
            testID="burst-pow"
            label="POW!"
            color={POP_YELLOW}
            rotate={-12}
            top="18%"
            left={14}
            delay={500}
          />
          <BurstBadge
            testID="burst-bam"
            label="BAM!"
            color={NEON_PINK}
            rotate={14}
            top="28%"
            right={16}
            delay={700}
          />
          <BurstBadge
            testID="burst-boom"
            label="BOOM!"
            color={POP_ORANGE}
            rotate={-6}
            top="48%"
            right={32}
            delay={900}
          />

          {/* Title pinned to bottom of hero */}
          <View style={styles.heroTitleBlock}>
            <AnimatedTitle />
            <View style={styles.tagline} testID="tagline">
              <Text style={styles.taglineText}>
                PHYSICS. PARTY. PURE MAYHEM.
              </Text>
            </View>
          </View>

          {generating && (
            <View style={styles.generatingOverlay} testID="generating-overlay">
              <ActivityIndicator
                testID="generating-spinner"
                color={POP_YELLOW}
                size="large"
              />
              <Text style={styles.generatingText}>BREWING FRESH CHAOS…</Text>
            </View>
          )}
        </View>

        {/* ----- BODY (fixed height) ----- */}
        <View style={styles.body}>
          {/* CTAs */}
          <View style={styles.ctaRow}>
            <ComicButton
              testID="play-now-primary-button"
              label="PLAY NOW"
              onPress={play}
              bg={NEON_PINK}
              fg="#FFFFFF"
            />
            <ComicButton
              testID="regenerate-key-art-button"
              label={generating ? "BREWING..." : "REGEN ART"}
              onPress={regenerate}
              bg={NEON_CYAN}
              fg={BG_DEEP}
              disabled={generating}
            />
          </View>

          {/* Caption */}
          <View style={styles.captionCard} testID="keyart-caption">
            <Text style={styles.captionLabel}>KEY ART</Text>
            <Text style={styles.captionText} numberOfLines={1}>
              {generating ? "Cooking up fresh chaos..." : caption}
            </Text>
          </View>

          {/* Roster */}
          <Text style={styles.rosterHeading} testID="roster-heading">
            MEET THE CHAOS CREW
          </Text>
          <ScrollView
            testID="character-roster-preview-strip"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rosterRow}
          >
            {ROSTER.map((c, i) => (
              <RosterCard key={c.id} item={c} index={i} />
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_DEEP },
  safe: { flex: 1 },

  // HERO
  heroWrap: {
    flex: 1,
    backgroundColor: BG_PURPLE,
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroTopFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(17,11,23,0.35)",
  },
  heroBottomFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 240,
    backgroundColor: "rgba(17,11,23,0.6)",
  },

  // Top bar
  topBar: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    gap: 10,
  },
  liveDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: NEON_PINK,
    borderWidth: 3,
    borderColor: BG_DEEP,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  liveDotInner: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  liveText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 1.4,
  },

  // Hero title
  heroTitleBlock: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  titleWrap: {
    alignItems: "center",
  },
  titleWord: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  titleMain: {
    color: "#FFFFFF",
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    lineHeight: 56,
  },
  titleShadowPink: {
    position: "absolute",
    color: NEON_PINK,
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 2,
    lineHeight: 56,
    opacity: 0.95,
  },
  titleShadowCyan: {
    position: "absolute",
    color: NEON_CYAN,
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 2,
    lineHeight: 56,
    opacity: 0.95,
  },
  titleShadowPos1: { left: -4, top: 4 },
  titleShadowPos2: { left: 4, top: -3 },

  tagline: {
    marginTop: 12,
    backgroundColor: POP_YELLOW,
    borderWidth: 3,
    borderColor: BG_DEEP,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    transform: [{ rotate: "-2deg" }],
  },
  taglineText: {
    color: BG_DEEP,
    fontWeight: "900",
    letterSpacing: 1.2,
    fontSize: 12,
  },

  // Bursts
  burstBadge: {
    position: "absolute",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: BG_DEEP,
  },
  burstText: {
    color: BG_DEEP,
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
  },

  // Generating overlay
  generatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,11,23,0.78)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  generatingText: {
    color: POP_YELLOW,
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 14,
    marginTop: 12,
  },

  // BODY
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: BG_DEEP,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  btnOuter: {
    flex: 1,
  },
  btnInner: {
    borderWidth: 4,
    borderColor: "#000",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLabel: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  captionCard: {
    backgroundColor: BG_PURPLE,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  captionLabel: {
    color: POP_YELLOW,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 2,
  },
  captionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },

  // Roster
  rosterHeading: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  rosterRow: {
    gap: 10,
    paddingRight: 6,
  },
  rosterCard: {
    width: 96,
    backgroundColor: BG_PURPLE,
    borderWidth: 3,
    borderColor: "#000",
    borderRadius: 14,
    padding: 6,
    alignItems: "center",
  },
  rosterThumb: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 6,
  },
  rosterImg: { width: "100%", height: "100%" },
  rosterEmoji: { fontSize: 36 },
  rosterName: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 11,
  },
  rosterTag: {
    marginTop: 3,
    backgroundColor: POP_YELLOW,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 2,
    borderColor: "#000",
  },
  rosterTagText: {
    color: BG_DEEP,
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 0.8,
  },
});
