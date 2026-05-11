import { offshoreInterceptionConfig } from './interceptionConfig.js';

export function createProbabilityDecisionProvider(random, probabilities = {}) {
  const radioAnswerProbability = probabilities.radioAnswerProbability
    ?? offshoreInterceptionConfig.radioAnswerProbability;
  const magSuccessProbability = probabilities.magSuccessProbability
    ?? offshoreInterceptionConfig.magDestructiveSuccessProbability;

  return {
    doesTargetAnswerRadio() {
      return random.chance(radioAnswerProbability);
    },
    isOperatorApprovalGranted() {
      return true;
    },
    doesMagShotSucceed() {
      return random.chance(magSuccessProbability);
    },
  };
}

export function createDeterministicDecisionProvider({
  doesTargetAnswerRadio = false,
  isOperatorApprovalGranted = true,
  doesMagShotSucceed = true,
} = {}) {
  return {
    doesTargetAnswerRadio: () => doesTargetAnswerRadio,
    isOperatorApprovalGranted: () => isOperatorApprovalGranted,
    doesMagShotSucceed: () => doesMagShotSucceed,
  };
}
