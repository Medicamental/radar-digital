// Porteiro na frente do site -- 2026-10-29; senha fixa (secret DIGITAL_SENHA) desde 30/10/2026
import app from "./worker.js";
import { comPortao } from "./portao.mjs";
export default comPortao(app, "Radar Digital", "DIGITAL_SENHA");
