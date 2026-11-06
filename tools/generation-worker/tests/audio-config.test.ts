import assert from "node:assert/strict";
import {test} from "node:test";
import {checkSpeechConfiguration} from "../src/audio.js";
import {EdgeConfigurationError} from "../src/enrich.js";
test("unsupported narration and absent Azure configuration fail before synthesis",()=>{
  assert.throws(()=>checkSpeechConfiguration({STORY_TTS_EN_PROVIDER:"tencent"},"en"),
    error=>error instanceof EdgeConfigurationError&&error.code==="narration_provider_unsupported");
  assert.throws(()=>checkSpeechConfiguration({},"zh"),
    error=>error instanceof EdgeConfigurationError&&error.code==="narration_not_configured");
  assert.doesNotThrow(()=>checkSpeechConfiguration({AZURE_SPEECH_KEY:"fixture-key",AZURE_SPEECH_REGION:"fixture"},"zh"));
});
