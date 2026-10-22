/**
 * Confidence Calibration Module
 * Source of truth: PRD FR-09, DESIGN §3.2
 *
 * Compares metacognitive confidence rating (1, 2, or 3) with objective recall quality (0-5)
 * to provide non-shaming, calibrated feedback that develops learner self-assessment.
 */

export type CalibrationCategory =
  | 'overconfident' // High confidence (3), low score (q <= 2)
  | 'underconfident' // Low confidence (1), high score (q >= 4)
  | 'calibrated_mastery' // High confidence (3), high score (q >= 4)
  | 'calibrated_passing' // High confidence (3), passing score (q == 3)
  | 'moderate_balanced' // Moderate confidence (2), any score
  | 'cautious_aligned'; // Low confidence (1), modest/low score (q <= 3)

export interface CalibrationResult {
  category: CalibrationCategory;
  message: string;
  tone: 'growth' | 'reinforcing' | 'supportive';
  suggestedAction: string;
}

/**
 * Normalizes confidence input (1, 2, 3 or string 'low' | 'medium' | 'high') to 1 | 2 | 3.
 */
export function normalizeConfidenceNumber(confidence: number | string | null | undefined): 1 | 2 | 3 {
  if (confidence === 3 || confidence === 'high') return 3;
  if (confidence === 1 || confidence === 'low') return 1;
  return 2;
}

/**
 * Computes calibrated feedback for all 18 combinations of confidence (1..3) and quality grade (0..5).
 */
export function getConfidenceCalibration(
  confidenceInput: number | string | null | undefined,
  qualityGradeInput: number | null | undefined,
  options: {
    misconceptions?: string[];
    strengths?: string[];
  } = {},
): CalibrationResult {
  const conf = normalizeConfidenceNumber(confidenceInput);
  const q = Math.max(0, Math.min(5, Math.round(qualityGradeInput ?? 0)));

  // Case 1: High confidence (3) with q <= 2 (Overconfident / Blindspot)
  if (conf === 3 && q <= 2) {
    const hasMisconceptions = options.misconceptions && options.misconceptions.length > 0;
    const detail = hasMisconceptions
      ? `A subtle detail or common misconception (${options.misconceptions?.[0]}) caught you by surprise.`
      : 'A tricky misconception often feels completely right until we inspect the fine details.';

    return {
      category: 'overconfident',
      message: `You felt very confident here. ${detail} That's a natural part of learning—let's clarify that specific concept so your confidence is fully backed by mastery.`,
      tone: 'growth',
      suggestedAction: 'Review the flagged misconception and try a targeted practice question.',
    };
  }

  // Case 2: Low confidence (1) with q >= 4 (Underconfident / Impostor Phenomenon)
  if (conf === 1 && q >= 4) {
    const hasStrengths = options.strengths && options.strengths.length > 0;
    const evidence = hasStrengths
      ? `You demonstrated clear recall: ${options.strengths?.[0]}.`
      : 'Your answer captured the essential mechanisms accurately.';

    return {
      category: 'underconfident',
      message: `You doubted your recall, but your explanation was spot on! ${evidence} Trust your knowledge—you know this material better than you gave yourself credit for.`,
      tone: 'reinforcing',
      suggestedAction: 'Take note of this success; trust your instincts on the next concept.',
    };
  }

  // Case 3: High confidence (3) with q >= 4 (Calibrated Mastery)
  if (conf === 3 && q >= 4) {
    return {
      category: 'calibrated_mastery',
      message:
        'Outstanding calibration! Your high confidence was fully matched by a thorough, accurate recall.',
      tone: 'reinforcing',
      suggestedAction: 'Keep up this momentum and proceed to the next concept.',
    };
  }

  // Case 4: High confidence (3) with q === 3 (Passing with Minor Gaps)
  if (conf === 3 && q === 3) {
    return {
      category: 'calibrated_passing',
      message:
        'Solid confidence backed by good understanding. Reviewing the missing points will make your recall airtight.',
      tone: 'supportive',
      suggestedAction: 'Check the missing key points before continuing.',
    };
  }

  // Case 5: Moderate confidence (2)
  if (conf === 2) {
    if (q >= 4) {
      return {
        category: 'moderate_balanced',
        message:
          'Great recall! Your steady approach and careful consideration paid off with a clear, accurate explanation.',
        tone: 'reinforcing',
        suggestedAction: 'You have solid grasp here; feel confident moving forward.',
      };
    }
    if (q === 3) {
      return {
        category: 'moderate_balanced',
        message:
          "Good foundational recall. You're on the right track, and checking the omissions will solidify the concept.",
        tone: 'supportive',
        suggestedAction: 'Review the omitted points to strengthen this foundation.',
      };
    }
    // q <= 2
    return {
      category: 'moderate_balanced',
      message:
        'Honest self-assessment. A quick targeted review of the source material will help make the connections click.',
      tone: 'growth',
      suggestedAction: 'Take a moment to review the source notes and try again.',
    };
  }

  // Case 6: Low confidence (1) with q <= 3 (Cautious Aligned)
  if (q === 3) {
    return {
      category: 'cautious_aligned',
      message:
        'You were cautious, and you proved you know the core principles. With a little more practice, your confidence will grow.',
      tone: 'supportive',
      suggestedAction: 'Solidify your understanding with another quick repetition.',
    };
  }

  // q <= 2
  return {
    category: 'cautious_aligned',
    message:
      'Accurate self-awareness in recognizing this concept needs more time. Stepping back to revise will make this familiar.',
    tone: 'growth',
    suggestedAction: 'Review the explanation and re-engage when ready.',
  };
}
