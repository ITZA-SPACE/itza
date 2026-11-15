import { describe, expect, it } from "vitest";
import { needsNasaData } from "../src/route";

describe("needsNasaData", () => {
  it.each([
    "What was the temperature last week?",
    "How much rainfall did we get?",
    "Is there NASA data for this?",
    "Search the CMR collection for soil moisture",
    "Quelle est la météo ?",
    "Combien de pluie est tombée ?",
    "شحال كانت الحرارة؟",
    "شحال من الشتا نزلات؟",
    "chta bzaf had l3am",
  ])("%s needs the NASA servers", (text) => {
    expect(needsNasaData(text)).toBe(true);
  });

  it.each([
    "salam, labas?",
    "Which rotation held up best?",
    "Quelle rotation a le mieux résisté ?",
    "شنو هي أحسن روطاسيون لحقلي؟",
    "What can you help me with?",
    "",
  ])("%j does not", (text) => {
    expect(needsNasaData(text)).toBe(false);
  });
});
