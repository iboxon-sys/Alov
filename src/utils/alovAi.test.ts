import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAlovAiPersona,
  detectMatchmakingIntent,
  filterCandidateMatches,
  buildAlovAiSystemInstruction,
  buildAlovAiFewShotMessages,
  sanitizeHumanBotPhrases,
  parseAlovAiStructuredOutput,
} from './alovAi.ts';

describe('Alov AI persona, matchmaking gating & structured DB profile matching', () => {
  it('assigns opposite-gender friend persona while keeping standard bot identity', () => {
    assert.equal(resolveAlovAiPersona('male'), 'female_friend');
    assert.equal(resolveAlovAiPersona('female'), 'male_friend');
    assert.equal(resolveAlovAiPersona(''), 'neutral_friend');
  });

  it('provides human-like few-shot turns and strips robotic assistant closings', () => {
    const maleFewShot = buildAlovAiFewShotMessages('male');
    assert.equal(maleFewShot.length >= 2, true);
    assert.equal(maleFewShot[0].role, 'user');
    assert.equal(maleFewShot[1].role, 'assistant');
    assert.ok(maleFewShot[1].content.includes('matchedUserUids'));

    const cleaned = sanitizeHumanBotPhrases(
      "Yaxshi rahmat! Bugun ob-havo juda zo'r ekan. Hozir esa sizga yordam berishga tayyorman."
    );
    assert.equal(cleaned, "Yaxshi rahmat! Bugun ob-havo juda zo'r ekan.");

    const cleanedAiTag = sanitizeHumanBotPhrases(
      "Salom, yaxshi o'tiribman. Sizga qanday yordam bera olaman?"
    );
    assert.equal(cleanedAiTag, "Salom, yaxshi o'tiribman.");
  });

  it('does NOT trigger matchmaking during casual small talk', () => {
    const casual = detectMatchmakingIntent(['Salom Alov AI!', 'Bugun ob-havo juda yaxshi ekan, ishlar qalay?']);
    assert.equal(casual.wantsMatchmaking, false);
    assert.equal(casual.requestedGender, null);

    const instruction = buildAlovAiSystemInstruction({
      requesterUser: { uid: 'u_boy', name: 'Aziz', gender: 'male' },
      candidatePool: [{ uid: 'u_girl', name: 'Madina', gender: 'female', age: 21 }],
      includeMatchmakingDatabase: false,
    });
    assert.ok(instruction.includes('QIZ BOLA'));
    assert.ok(instruction.includes('XUDDI TIRIK ODAMDEK'));
    assert.ok(!instruction.includes('u_girl'));
  });

  it('strips <think> blocks cleanly from LLM outputs while parsing JSON', () => {
    const output = parseAlovAiStructuredOutput(
      `<think>internal reasoning</think>\n{"reply": "Voy yaxshi-ku, ishlaringiz zo'r bo'lsin 😊", "matchedUserUids": []}`,
      [],
      false
    );
    assert.equal(output.reply, "Voy yaxshi-ku, ishlaringiz zo'r bo'lsin 😊");
    assert.equal(output.recommendedProfiles.length, 0);
  });

  it('triggers matchmaking and filters DB candidates accurately when user asks for a girl or boy', () => {
    const askGirl = detectMatchmakingIntent('Menga Toshkentdan 22 yoshli yaxshi qiz topib ber');
    assert.equal(askGirl.wantsMatchmaking, true);
    assert.equal(askGirl.requestedGender, 'female');

    const askBoy = detectMatchmakingIntent('Menga Samarqanddan 26 yoshli yigit topib ber');
    assert.equal(askBoy.wantsMatchmaking, true);
    assert.equal(askBoy.requestedGender, 'male');

    const dbUsers = [
      { uid: 'u_me', name: 'Aziz', gender: 'male', age: 25, isProfileCompleted: true },
      { uid: 'alov_ai_bot', name: 'Alov AI', gender: 'female', isProfileCompleted: true, isAI: true },
      { uid: 'u_banned', name: 'Banned', gender: 'female', age: 22, isBanned: true, isProfileCompleted: true },
      {
        uid: 'u_tashkent_girl',
        id: 'ALOV-TG1',
        name: 'Madina',
        username: 'madina_uz',
        gender: 'female',
        age: 22,
        region: 'Toshkent shahri',
        district: 'Chilonzor tumani',
        bio: 'Kitob o‘qiyman',
        avatar: '/api/media/madina.jpg',
        isOnline: true,
        isProfileCompleted: true,
        faceId: { verified: true },
      },
      {
        uid: 'u_samarkand_girl',
        id: 'ALOV-SG1',
        name: 'Dilnoza',
        gender: 'female',
        age: 34,
        region: 'Samarqand viloyati',
        district: 'Samarqand shahri',
        isProfileCompleted: true,
      },
      {
        uid: 'u_boy_other',
        name: 'Sardor',
        gender: 'male',
        age: 26,
        region: 'Toshkent shahri',
        isProfileCompleted: true,
      },
    ];

    const matches = filterCandidateMatches(dbUsers, dbUsers[0], 'Menga Toshkentdan 22 yoshli qiz topib ber');
    assert.equal(matches[0].uid, 'u_tashkent_girl');
    assert.equal(matches.some((m) => m.uid === 'u_me' || m.uid === 'alov_ai_bot' || m.uid === 'u_banned'), false);

    // Structured output parser hydrates ONLY verified real candidates and ignores hallucinated UIDs
    const parsed = parseAlovAiStructuredOutput(
      JSON.stringify({
        reply: "Mana Toshkentdan 22 yoshli Madina bilan tanishib ko'rishingiz mumkin!",
        matchedUserUids: ['u_tashkent_girl', 'fake_uid_999'],
      }),
      matches,
      true
    );
    assert.equal(parsed.recommendedProfiles.length, 1);
    assert.equal(parsed.recommendedProfiles[0].uid, 'u_tashkent_girl');
    assert.equal(parsed.recommendedProfiles[0].region, 'Toshkent shahri');

    // When allowMatchCards is false, matchedUserUids are never surfaced
    const blockedCards = parseAlovAiStructuredOutput(
      JSON.stringify({ reply: 'Oddiy suhbat!', matchedUserUids: ['u_tashkent_girl'] }),
      matches,
      false
    );
    assert.equal(blockedCards.recommendedProfiles.length, 0);
  });
});
