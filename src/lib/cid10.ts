/**
 * Catálogo CID-10 local com busca (item 32 da auditoria de melhorias
 * médicas): os campos de CID da evolução, do atestado e da folha de
 * emissão eram texto livre, sem catálogo em lugar nenhum — o médico
 * digitava o código de memória (ou deixava em branco).
 *
 * IMPORTANTE — o que isto é e o que NÃO é: um SUBCONJUNTO CURADO dos
 * códigos mais usados em atenção primária e telemedicina (ordem de
 * grandeza: algumas centenas), com a descrição em pt-BR no padrão da
 * tabela CID-10 (DATASUS). NÃO é a tabela completa da OMS (que tem
 * ~14 mil categorias/subcategorias): código fora do catálogo continua
 * podendo ser digitado livremente no campo, como hoje — a busca é um
 * atalho, não uma trava.
 *
 * O valor GRAVADO continua sendo só o código (ex.: "J06.9"), no mesmo
 * formato que a API já aceita: selecionar uma sugestão preenche o
 * código e a descrição aparece como legenda de conferência.
 *
 * Funções puras; a UI (components/bion/medico/campo-cid-busca.tsx) só
 * renderiza.
 */
import { normalizarTextoPrescricao } from "./seguranca-prescricao";

export type EntradaCid = {
  /** Código CID-10 como é gravado (ex.: "J06.9"; categorias de 3 caracteres sem ponto). */
  codigo: string;
  /** Descrição em pt-BR (padrão da tabela CID-10/DATASUS, forma enxuta). */
  descricao: string;
};

export const CATALOGO_CID10: EntradaCid[] = [
  // ── Capítulo I — Doenças infecciosas e parasitárias ─────────────────
  { codigo: "A04.9", descricao: "Infecção intestinal bacteriana não especificada" },
  { codigo: "A09", descricao: "Diarreia e gastroenterite de origem infecciosa presumida" },
  { codigo: "A16.2", descricao: "Tuberculose pulmonar, sem menção de confirmação" },
  { codigo: "A37.9", descricao: "Coqueluche não especificada" },
  { codigo: "A46", descricao: "Erisipela" },
  { codigo: "A49.9", descricao: "Infecção bacteriana não especificada" },
  { codigo: "A53.9", descricao: "Sífilis não especificada" },
  { codigo: "A54.9", descricao: "Infecção gonocócica não especificada" },
  { codigo: "A56.0", descricao: "Infecção por clamídia do trato geniturinário inferior" },
  { codigo: "A59.9", descricao: "Tricomoníase não especificada" },
  { codigo: "A60.0", descricao: "Infecção herpética dos órgãos genitais e do trato geniturinário" },
  { codigo: "A63.0", descricao: "Verrugas anogenitais (venéreas)" },
  { codigo: "A74.9", descricao: "Infecção por clamídia não especificada" },
  { codigo: "B00.9", descricao: "Infecção herpética não especificada" },
  { codigo: "B01.9", descricao: "Varicela sem complicações" },
  { codigo: "B02.9", descricao: "Herpes zoster sem complicações" },
  { codigo: "B05.9", descricao: "Sarampo sem complicações" },
  { codigo: "B06.9", descricao: "Rubéola sem complicações" },
  { codigo: "B07", descricao: "Verrugas de origem viral" },
  { codigo: "B08.5", descricao: "Faringite vesicular devida a enterovírus (herpangina)" },
  { codigo: "B26.9", descricao: "Parotidite epidêmica (caxumba) sem complicações" },
  { codigo: "B34.9", descricao: "Infecção viral não especificada" },
  { codigo: "B35.1", descricao: "Tinha da unha" },
  { codigo: "B35.3", descricao: "Tinha dos pés" },
  { codigo: "B35.4", descricao: "Tinha do corpo" },
  { codigo: "B37.0", descricao: "Estomatite por Candida" },
  { codigo: "B37.3", descricao: "Candidíase da vulva e da vagina" },
  { codigo: "B37.9", descricao: "Candidíase não especificada" },
  { codigo: "B65.9", descricao: "Esquistossomose não especificada" },
  { codigo: "B80", descricao: "Enterobíase" },
  { codigo: "B85.1", descricao: "Pediculose devida a piolho da cabeça" },
  { codigo: "B86", descricao: "Escabiose (sarna)" },
  // ── Capítulo II — Neoplasias ────────────────────────────────────────
  { codigo: "C50.9", descricao: "Neoplasia maligna da mama, não especificada" },
  { codigo: "C61", descricao: "Neoplasia maligna da próstata" },
  // ── Capítulo III — Sangue e órgãos hematopoéticos ───────────────────
  { codigo: "D50.9", descricao: "Anemia por deficiência de ferro, não especificada" },
  { codigo: "D64.9", descricao: "Anemia não especificada" },
  // ── Capítulo IV — Endócrinas, nutricionais e metabólicas ────────────
  { codigo: "E03.9", descricao: "Hipotireoidismo não especificado" },
  { codigo: "E05.9", descricao: "Tireotoxicose não especificada" },
  { codigo: "E10.9", descricao: "Diabetes mellitus insulino-dependente, sem complicações" },
  { codigo: "E11.9", descricao: "Diabetes mellitus não insulino-dependente, sem complicações" },
  { codigo: "E14.9", descricao: "Diabetes mellitus não especificado, sem complicações" },
  { codigo: "E53.8", descricao: "Deficiência de outras vitaminas do grupo B especificadas" },
  { codigo: "E55.9", descricao: "Deficiência não especificada de vitamina D" },
  { codigo: "E66.9", descricao: "Obesidade não especificada" },
  { codigo: "E78.0", descricao: "Hipercolesterolemia pura" },
  { codigo: "E78.2", descricao: "Hiperlipidemia mista" },
  { codigo: "E78.5", descricao: "Hiperlipidemia não especificada" },
  { codigo: "E79.0", descricao: "Hiperuricemia sem sinais de artrite inflamatória" },
  { codigo: "E86", descricao: "Depleção de volume (desidratação)" },
  // ── Capítulo V — Transtornos mentais e comportamentais ──────────────
  { codigo: "F17.2", descricao: "Uso de fumo — síndrome de dependência (tabagismo)" },
  { codigo: "F20.9", descricao: "Esquizofrenia não especificada" },
  { codigo: "F31.9", descricao: "Transtorno afetivo bipolar não especificado" },
  { codigo: "F32.0", descricao: "Episódio depressivo leve" },
  { codigo: "F32.1", descricao: "Episódio depressivo moderado" },
  { codigo: "F32.2", descricao: "Episódio depressivo grave sem sintomas psicóticos" },
  { codigo: "F32.9", descricao: "Episódio depressivo não especificado" },
  { codigo: "F33.9", descricao: "Transtorno depressivo recorrente não especificado" },
  { codigo: "F34.1", descricao: "Distimia" },
  { codigo: "F40.1", descricao: "Fobias sociais" },
  { codigo: "F41.0", descricao: "Transtorno de pânico (ansiedade paroxística episódica)" },
  { codigo: "F41.1", descricao: "Ansiedade generalizada" },
  { codigo: "F41.2", descricao: "Transtorno misto ansioso e depressivo" },
  { codigo: "F41.9", descricao: "Transtorno ansioso não especificado" },
  { codigo: "F43.0", descricao: "Reação aguda ao estresse" },
  { codigo: "F43.1", descricao: "Transtorno de estresse pós-traumático" },
  { codigo: "F43.2", descricao: "Transtornos de adaptação" },
  { codigo: "F43.9", descricao: "Reação ao estresse grave, não especificada" },
  { codigo: "F45.0", descricao: "Transtorno de somatização" },
  { codigo: "F50.0", descricao: "Anorexia nervosa" },
  { codigo: "F50.2", descricao: "Bulimia nervosa" },
  { codigo: "F51.0", descricao: "Insônia não orgânica" },
  { codigo: "F84.0", descricao: "Autismo infantil" },
  { codigo: "F84.5", descricao: "Síndrome de Asperger" },
  { codigo: "F90.0", descricao: "Distúrbios da atividade e da atenção (TDAH)" },
  // ── Capítulo VI — Doenças do sistema nervoso ────────────────────────
  { codigo: "G20", descricao: "Doença de Parkinson" },
  { codigo: "G25.0", descricao: "Tremor essencial" },
  { codigo: "G30.9", descricao: "Doença de Alzheimer não especificada" },
  { codigo: "G35", descricao: "Esclerose múltipla" },
  { codigo: "G40.9", descricao: "Epilepsia não especificada" },
  { codigo: "G43.0", descricao: "Enxaqueca sem aura" },
  { codigo: "G43.1", descricao: "Enxaqueca com aura" },
  { codigo: "G43.9", descricao: "Enxaqueca não especificada" },
  { codigo: "G44.2", descricao: "Cefaleia tensional" },
  { codigo: "G47.0", descricao: "Distúrbios do início e da manutenção do sono (insônia)" },
  { codigo: "G47.3", descricao: "Apneia de sono" },
  { codigo: "G50.0", descricao: "Nevralgia do trigêmeo" },
  { codigo: "G51.0", descricao: "Paralisia de Bell" },
  { codigo: "G56.0", descricao: "Síndrome do túnel do carpo" },
  { codigo: "G62.9", descricao: "Polineuropatia não especificada" },
  // ── Capítulos VII/VIII — Olho e ouvido ──────────────────────────────
  { codigo: "H10.3", descricao: "Conjuntivite aguda não especificada" },
  { codigo: "H10.9", descricao: "Conjuntivite não especificada" },
  { codigo: "H52.1", descricao: "Miopia" },
  { codigo: "H52.4", descricao: "Presbiopia" },
  { codigo: "H60.9", descricao: "Otite externa não especificada" },
  { codigo: "H65.0", descricao: "Otite média aguda serosa" },
  { codigo: "H66.0", descricao: "Otite média aguda supurativa" },
  { codigo: "H66.9", descricao: "Otite média não especificada" },
  { codigo: "H81.0", descricao: "Doença de Ménière" },
  { codigo: "H81.1", descricao: "Vertigem paroxística posicional benigna" },
  { codigo: "H91.9", descricao: "Perda não especificada de audição" },
  { codigo: "H93.1", descricao: "Tinnitus (zumbido no ouvido)" },
  // ── Capítulo IX — Doenças do aparelho circulatório ──────────────────
  { codigo: "I10", descricao: "Hipertensão essencial (primária)" },
  { codigo: "I20.9", descricao: "Angina pectoris não especificada" },
  { codigo: "I21.9", descricao: "Infarto agudo do miocárdio não especificado" },
  { codigo: "I25.9", descricao: "Doença isquêmica crônica do coração não especificada" },
  { codigo: "I50.0", descricao: "Insuficiência cardíaca congestiva" },
  { codigo: "I50.9", descricao: "Insuficiência cardíaca não especificada" },
  { codigo: "I63.9", descricao: "Infarto cerebral não especificado" },
  { codigo: "I64", descricao: "Acidente vascular cerebral não especificado como hemorrágico ou isquêmico" },
  { codigo: "I83.9", descricao: "Varizes dos membros inferiores sem úlcera ou inflamação" },
  { codigo: "I87.2", descricao: "Insuficiência venosa crônica (periférica)" },
  // ── Capítulo X — Doenças do aparelho respiratório ───────────────────
  { codigo: "J00", descricao: "Nasofaringite aguda (resfriado comum)" },
  { codigo: "J01.9", descricao: "Sinusite aguda não especificada" },
  { codigo: "J02.9", descricao: "Faringite aguda não especificada" },
  { codigo: "J03.9", descricao: "Amigdalite aguda não especificada" },
  { codigo: "J04.0", descricao: "Laringite aguda" },
  { codigo: "J06.9", descricao: "Infecções agudas das vias aéreas superiores de localizações múltiplas ou não especificadas" },
  { codigo: "J10.1", descricao: "Influenza com outras manifestações respiratórias, devida a vírus identificado" },
  { codigo: "J11.1", descricao: "Influenza com outras manifestações respiratórias, vírus não identificado" },
  { codigo: "J12.9", descricao: "Pneumonia viral não especificada" },
  { codigo: "J15.9", descricao: "Pneumonia bacteriana não especificada" },
  { codigo: "J18.9", descricao: "Pneumonia por microrganismo não especificado" },
  { codigo: "J20.9", descricao: "Bronquite aguda não especificada" },
  { codigo: "J21.9", descricao: "Bronquiolite aguda não especificada" },
  { codigo: "J30.1", descricao: "Rinite alérgica devida a pólen" },
  { codigo: "J30.4", descricao: "Rinite alérgica não especificada" },
  { codigo: "J32.9", descricao: "Sinusite crônica não especificada" },
  { codigo: "J34.2", descricao: "Desvio de septo nasal" },
  { codigo: "J35.0", descricao: "Amigdalite crônica" },
  { codigo: "J40", descricao: "Bronquite não especificada como aguda ou crônica" },
  { codigo: "J42", descricao: "Bronquite crônica não especificada" },
  { codigo: "J44.1", descricao: "Doença pulmonar obstrutiva crônica com exacerbação aguda não especificada" },
  { codigo: "J44.9", descricao: "Doença pulmonar obstrutiva crônica não especificada" },
  { codigo: "J45.0", descricao: "Asma predominantemente alérgica" },
  { codigo: "J45.9", descricao: "Asma não especificada" },
  { codigo: "J47", descricao: "Bronquiectasia" },
  // ── Capítulo XI — Doenças do aparelho digestivo ─────────────────────
  { codigo: "K02.9", descricao: "Cárie dentária não especificada" },
  { codigo: "K04.0", descricao: "Pulpite" },
  { codigo: "K12.0", descricao: "Aftas bucais recidivantes" },
  { codigo: "K21.0", descricao: "Doença de refluxo gastroesofágico com esofagite" },
  { codigo: "K21.9", descricao: "Doença de refluxo gastroesofágico sem esofagite" },
  { codigo: "K29.7", descricao: "Gastrite não especificada" },
  { codigo: "K30", descricao: "Dispepsia funcional" },
  { codigo: "K40.9", descricao: "Hérnia inguinal unilateral, sem obstrução ou gangrena" },
  { codigo: "K51.9", descricao: "Colite ulcerativa não especificada" },
  { codigo: "K52.9", descricao: "Gastroenterite e colite não infecciosas não especificadas" },
  { codigo: "K58.0", descricao: "Síndrome do cólon irritável com diarreia" },
  { codigo: "K58.9", descricao: "Síndrome do cólon irritável sem diarreia" },
  { codigo: "K59.0", descricao: "Constipação" },
  { codigo: "K60.2", descricao: "Fissura anal não especificada" },
  { codigo: "K64.9", descricao: "Hemorroidas não especificadas" },
  { codigo: "K74.6", descricao: "Outras formas de cirrose hepática e as não especificadas" },
  { codigo: "K76.0", descricao: "Fígado gorduroso (esteatose hepática) não classificado em outra parte" },
  { codigo: "K80.2", descricao: "Calculose da vesícula biliar sem colecistite" },
  { codigo: "K81.0", descricao: "Colecistite aguda" },
  { codigo: "K85.9", descricao: "Pancreatite aguda não especificada" },
  // ── Capítulo XII — Doenças da pele e do tecido subcutâneo ───────────
  { codigo: "L01.0", descricao: "Impetigo" },
  { codigo: "L02.9", descricao: "Abscesso cutâneo, furúnculo e antraz de localização não especificada" },
  { codigo: "L03.9", descricao: "Celulite não especificada" },
  { codigo: "L20.9", descricao: "Dermatite atópica não especificada" },
  { codigo: "L21.9", descricao: "Dermatite seborreica não especificada" },
  { codigo: "L23.9", descricao: "Dermatite alérgica de contato, causa não especificada" },
  { codigo: "L25.9", descricao: "Dermatite de contato não especificada, causa não especificada" },
  { codigo: "L29.9", descricao: "Prurido não especificado" },
  { codigo: "L30.9", descricao: "Dermatite não especificada" },
  { codigo: "L40.9", descricao: "Psoríase não especificada" },
  { codigo: "L42", descricao: "Pitiríase rósea" },
  { codigo: "L50.0", descricao: "Urticária alérgica" },
  { codigo: "L50.9", descricao: "Urticária não especificada" },
  { codigo: "L57.0", descricao: "Ceratose actínica" },
  { codigo: "L60.0", descricao: "Unha encravada" },
  { codigo: "L65.9", descricao: "Perda de cabelo não cicatricial não especificada" },
  { codigo: "L70.0", descricao: "Acne vulgar" },
  { codigo: "L73.2", descricao: "Hidradenite supurativa" },
  { codigo: "L97", descricao: "Úlcera de membro inferior não classificada em outra parte" },
  // ── Capítulo XIII — Doenças osteomusculares e do tecido conjuntivo ──
  { codigo: "M05.9", descricao: "Artrite reumatoide soropositiva" },
  { codigo: "M06.9", descricao: "Artrite reumatoide não especificada" },
  { codigo: "M10.9", descricao: "Gota não especificada" },
  { codigo: "M13.9", descricao: "Artrite não especificada" },
  { codigo: "M16.9", descricao: "Coxartrose não especificada" },
  { codigo: "M17.9", descricao: "Gonartrose não especificada" },
  { codigo: "M19.9", descricao: "Artrose não especificada" },
  { codigo: "M25.5", descricao: "Dor articular" },
  { codigo: "M41.9", descricao: "Escoliose não especificada" },
  { codigo: "M43.6", descricao: "Torcicolo" },
  { codigo: "M45", descricao: "Espondilite ancilosante" },
  { codigo: "M47.9", descricao: "Espondilose não especificada" },
  { codigo: "M51.1", descricao: "Transtorno de disco lombar e de outros discos intervertebrais com radiculopatia" },
  { codigo: "M54.1", descricao: "Radiculopatia" },
  { codigo: "M54.2", descricao: "Cervicalgia" },
  { codigo: "M54.3", descricao: "Ciática" },
  { codigo: "M54.4", descricao: "Lumbago com ciática" },
  { codigo: "M54.5", descricao: "Dor lombar baixa" },
  { codigo: "M54.6", descricao: "Dor na coluna torácica" },
  { codigo: "M54.9", descricao: "Dorsalgia não especificada" },
  { codigo: "M65.3", descricao: "Dedo em gatilho" },
  { codigo: "M65.4", descricao: "Tenossinovite estilóide radial (de Quervain)" },
  { codigo: "M65.9", descricao: "Sinovite e tenossinovite não especificadas" },
  { codigo: "M67.4", descricao: "Gânglio (cisto sinovial)" },
  { codigo: "M75.0", descricao: "Capsulite adesiva do ombro" },
  { codigo: "M75.1", descricao: "Síndrome do manguito rotador" },
  { codigo: "M75.5", descricao: "Bursite do ombro" },
  { codigo: "M77.1", descricao: "Epicondilite lateral" },
  { codigo: "M77.3", descricao: "Esporão do calcâneo" },
  { codigo: "M79.1", descricao: "Mialgia" },
  { codigo: "M79.2", descricao: "Nevralgia e neurite não especificadas" },
  { codigo: "M79.6", descricao: "Dor em membro" },
  { codigo: "M79.7", descricao: "Fibromialgia" },
  { codigo: "M81.9", descricao: "Osteoporose não especificada, sem fratura patológica" },
  // ── Capítulo XIV — Doenças do aparelho geniturinário ────────────────
  { codigo: "N10", descricao: "Nefrite tubulointersticial aguda (pielonefrite aguda)" },
  { codigo: "N12", descricao: "Nefrite tubulointersticial não especificada como aguda ou crônica" },
  { codigo: "N18.9", descricao: "Insuficiência renal crônica não especificada" },
  { codigo: "N20.0", descricao: "Calculose do rim" },
  { codigo: "N23", descricao: "Cólica nefrética não especificada" },
  { codigo: "N30.0", descricao: "Cistite aguda" },
  { codigo: "N30.9", descricao: "Cistite não especificada" },
  { codigo: "N39.0", descricao: "Infecção do trato urinário de localização não especificada" },
  { codigo: "N40", descricao: "Hiperplasia da próstata" },
  { codigo: "N41.0", descricao: "Prostatite aguda" },
  { codigo: "N41.1", descricao: "Prostatite crônica" },
  { codigo: "N41.9", descricao: "Doença inflamatória da próstata não especificada" },
  { codigo: "N45.9", descricao: "Orquite, epididimite e epididimo-orquite sem menção de abscesso" },
  { codigo: "N47", descricao: "Prepúcio excessivo (fimose)" },
  { codigo: "N48.1", descricao: "Balanopostite" },
  { codigo: "N61", descricao: "Transtornos inflamatórios da mama" },
  { codigo: "N63", descricao: "Nódulo mamário não especificado" },
  { codigo: "N64.4", descricao: "Mastodinia (dor mamária)" },
  { codigo: "N72", descricao: "Doença inflamatória do colo do útero" },
  { codigo: "N73.9", descricao: "Doença inflamatória pélvica feminina não especificada" },
  { codigo: "N76.0", descricao: "Vaginite aguda" },
  { codigo: "N80.9", descricao: "Endometriose não especificada" },
  { codigo: "N83.2", descricao: "Outros cistos ovarianos e os não especificados" },
  { codigo: "N91.2", descricao: "Amenorreia não especificada" },
  { codigo: "N92.0", descricao: "Menstruação excessiva e frequente com ciclo regular" },
  { codigo: "N92.6", descricao: "Menstruação irregular não especificada" },
  { codigo: "N94.4", descricao: "Dismenorreia primária" },
  { codigo: "N94.6", descricao: "Dismenorreia não especificada" },
  { codigo: "N95.1", descricao: "Distúrbios menopáusicos e outros distúrbios perimenopáusicos" },
  { codigo: "N95.2", descricao: "Vaginite pós-menopáusica atrófica" },
  // ── Capítulo XV — Gravidez, parto e puerpério (só o comum em atestado)
  { codigo: "O20.0", descricao: "Ameaça de aborto" },
  { codigo: "O21.0", descricao: "Hiperêmese gravídica leve" },
  { codigo: "O24.4", descricao: "Diabetes mellitus que surge na gravidez" },
  // ── Capítulo XVIII — Sintomas, sinais e achados anormais (R) ────────
  { codigo: "R03.0", descricao: "Pressão arterial elevada sem diagnóstico de hipertensão" },
  { codigo: "R04.0", descricao: "Epistaxe" },
  { codigo: "R05", descricao: "Tosse" },
  { codigo: "R06.0", descricao: "Dispneia" },
  { codigo: "R07.0", descricao: "Dor de garganta" },
  { codigo: "R07.4", descricao: "Dor torácica não especificada" },
  { codigo: "R10.2", descricao: "Dor pélvica e perineal" },
  { codigo: "R10.4", descricao: "Outras dores abdominais e as não especificadas" },
  { codigo: "R10.9", descricao: "Dor abdominal não especificada" },
  { codigo: "R11", descricao: "Náusea e vômito" },
  { codigo: "R12", descricao: "Pirose (azia)" },
  { codigo: "R13", descricao: "Disfagia" },
  { codigo: "R14", descricao: "Flatulência e afecções correlatas" },
  { codigo: "R17", descricao: "Icterícia não especificada" },
  { codigo: "R19.7", descricao: "Diarreia não especificada" },
  { codigo: "R21", descricao: "Eritema e outras erupções cutâneas não especificadas" },
  { codigo: "R30.0", descricao: "Disúria" },
  { codigo: "R31", descricao: "Hematúria não especificada" },
  { codigo: "R32", descricao: "Incontinência urinária não especificada" },
  { codigo: "R33", descricao: "Retenção urinária" },
  { codigo: "R42", descricao: "Tontura e instabilidade" },
  { codigo: "R49.0", descricao: "Disfonia" },
  { codigo: "R50.9", descricao: "Febre não especificada" },
  { codigo: "R51", descricao: "Cefaleia" },
  { codigo: "R52.9", descricao: "Dor não especificada" },
  { codigo: "R53", descricao: "Mal-estar e fadiga" },
  { codigo: "R55", descricao: "Síncope e colapso" },
  { codigo: "R73.9", descricao: "Hiperglicemia não especificada" },
  // ── Capítulos XIX/XX — Lesões e causas externas selecionadas ────────
  { codigo: "S13.4", descricao: "Entorse e distensão da coluna cervical" },
  { codigo: "S33.5", descricao: "Entorse e distensão da coluna lombar" },
  { codigo: "S80.0", descricao: "Contusão do joelho" },
  { codigo: "S93.4", descricao: "Entorse e distensão do tornozelo" },
  { codigo: "T78.3", descricao: "Edema angioneurótico" },
  { codigo: "T78.4", descricao: "Alergia não especificada" },
  { codigo: "T88.7", descricao: "Efeito adverso não especificado de medicamento" },
  // ── Capítulo XXI — Contato com serviços de saúde (Z) ────────────────
  { codigo: "Z00.0", descricao: "Exame médico geral" },
  { codigo: "Z00.1", descricao: "Exame de rotina de saúde da criança" },
  { codigo: "Z01.0", descricao: "Exame dos olhos e da visão" },
  { codigo: "Z01.2", descricao: "Exame dentário" },
  { codigo: "Z01.4", descricao: "Exame ginecológico (geral) (de rotina)" },
  { codigo: "Z02.1", descricao: "Exame pré-admissional" },
  { codigo: "Z02.5", descricao: "Exame para participação em esporte" },
  { codigo: "Z02.7", descricao: "Obtenção de atestado médico" },
  { codigo: "Z03.9", descricao: "Observação por suspeita de doença ou afecção não especificada" },
  { codigo: "Z12.3", descricao: "Exame especial de rastreamento de neoplasia de mama" },
  { codigo: "Z12.4", descricao: "Exame especial de rastreamento de neoplasia do colo do útero" },
  { codigo: "Z13.1", descricao: "Exame especial de rastreamento de diabetes mellitus" },
  { codigo: "Z33", descricao: "Gravidez como achado casual" },
  { codigo: "Z34.9", descricao: "Supervisão de gravidez normal não especificada" },
  { codigo: "Z72.0", descricao: "Tabagismo" },
  { codigo: "Z72.1", descricao: "Uso de álcool" },
  { codigo: "Z73.0", descricao: "Esgotamento (burnout)" },
  { codigo: "Z73.3", descricao: "Estresse não classificado em outra parte" },
  { codigo: "Z76.0", descricao: "Emissão de prescrição repetida" },
  // ── Capítulo XXII — Códigos para propósitos especiais ───────────────
  { codigo: "U07.1", descricao: "COVID-19, vírus identificado" },
  { codigo: "U07.2", descricao: "COVID-19, vírus não identificado" },
];

/** Código em forma comparável: maiúsculas, só letras e dígitos ("j06.9" → "J069"). */
export function normalizarCodigoCid(codigo: string | null | undefined): string {
  return String(codigo ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Entrada EXATA do catálogo para um código (aceita "j06.9", "J069" etc.).
 * null quando o código não está no subconjunto curado — o que não quer
 * dizer que seja inválido (a tabela completa é muito maior).
 */
export function cidDoCatalogo(codigo: string | null | undefined): EntradaCid | null {
  const alvo = normalizarCodigoCid(codigo);
  if (!alvo) return null;
  return CATALOGO_CID10.find((e) => normalizarCodigoCid(e.codigo) === alvo) ?? null;
}

/** Prefixo comum de duas palavras já normalizadas. */
function prefixoComum(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Um token da busca corresponde a um token da descrição quando um é
 * prefixo do outro ("rinite" ~ "rinite") ou quando diferem só no
 * desfecho a partir de um radical longo ("urinária" ~ "urinário",
 * "diabete" ~ "diabetes") — a mesma ideia dos tokens da prescrição.
 */
function tokenCorresponde(busca: string, descricao: string): boolean {
  if (!busca || !descricao) return false;
  if (busca === descricao) return true;
  // Token curtíssimo ("e", "de") nunca casa por prefixo/radical.
  if (Math.min(busca.length, descricao.length) < 3) return false;
  if (descricao.startsWith(busca) || busca.startsWith(descricao)) return true;
  const menor = Math.min(busca.length, descricao.length);
  const comum = prefixoComum(busca, descricao);
  // Radical comum de pelo menos 4 letras cobrindo quase todo o token
  // menor ("ansi…" liga ansiedade↔ansioso; "urinari…" urinária↔urinário).
  return comum >= 4 && comum >= menor - 3;
}

/**
 * Busca no catálogo por código ou por termo da descrição.
 * - Por código: "j06", "J30.1" ou "j301" acham as subcategorias do
 *   prefixo; o código exato vem primeiro.
 * - Por termo: todos os tokens da busca precisam corresponder a algum
 *   token da descrição, com a normalização sem acento/caixa de
 *   normalizarTextoPrescricao ("infecção urinária" acha N39.0).
 * Consulta vazia ou sem correspondência devolve [].
 */
export function buscarCid(consulta: string | null | undefined, limite = 8): EntradaCid[] {
  const bruto = String(consulta ?? "").trim();
  if (!bruto) return [];
  const teto = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 8;

  const qCod = normalizarCodigoCid(bruto);
  const buscaPorCodigo = /^[A-Z]\d{0,3}$/.test(qCod);
  const porCodigo: EntradaCid[] = buscaPorCodigo
    ? CATALOGO_CID10.filter((e) => normalizarCodigoCid(e.codigo).startsWith(qCod)).sort((a, b) => {
        const aExato = normalizarCodigoCid(a.codigo) === qCod ? 0 : 1;
        const bExato = normalizarCodigoCid(b.codigo) === qCod ? 0 : 1;
        return aExato - bExato || a.codigo.localeCompare(b.codigo);
      })
    : [];

  // Consulta em formato de código ("E11", "j30.1") é busca por código e
  // só por código: misturar descrição traria ruído (o token "e11" casaria
  // com a conjunção "e" das descrições).
  const qNorm = normalizarTextoPrescricao(bruto);
  const tokensBusca = qNorm.split(" ").filter(Boolean);
  const jaIncluidos = new Set(porCodigo.map((e) => e.codigo));
  const porDescricao: EntradaCid[] =
    buscaPorCodigo || tokensBusca.length === 0
      ? []
      : CATALOGO_CID10.filter((e) => {
          if (jaIncluidos.has(e.codigo)) return false;
          const descNorm = normalizarTextoPrescricao(e.descricao);
          if (descNorm.includes(qNorm)) return true;
          const tokensDesc = descNorm.split(" ").filter(Boolean);
          return tokensBusca.every((t) => tokensDesc.some((d) => tokenCorresponde(t, d)));
        });

  return [...porCodigo, ...porDescricao].slice(0, teto);
}
