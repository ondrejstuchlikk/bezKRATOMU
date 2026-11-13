"""Caffeine PK model: parameter synthesis, calibration, validation, figures and app constants.
Run: python3 -I docs/caffeine-pk-model/model.py  (writes fig/*.pdf, numbers.tex and ts_constants.json here)

Model (option A in the report): one compartment, first-order absorption, first-order elimination,
complete oral bioavailability. For a dose D (mg) taken t hours ago:
    gut(t)  = D * exp(-ka t)                                   (not yet absorbed)
    body(t) = D * ka/(ka-ke) * (exp(-ke t) - exp(-ka t))      (absorbed, not yet eliminated)
    C(t)    = body(t) / (V_kg * weight)                       (plasma concentration, mg/L)
"""
import json, os
import numpy as np
from scipy.optimize import brentq, minimize_scalar
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, "fig")
os.makedirs(FIG, exist_ok=True)
plt.rcParams.update({"font.family": "serif", "font.size": 9, "axes.spines.top": False,
                     "axes.spines.right": False, "figure.dpi": 150, "legend.frameon": False})
C_BODY, C_GUT, C_REF, C_GREY, C_ALT = "#7c4a1e", "#c9a27a", "#1f5aa6", "#888888", "#c2410c"
MW = 194.19            # g/mol, caffeine
REF_WEIGHT = 70.0      # kg, default adult (user decision)
CUP_MG = 100.0         # mg per "šálek kávy" in the app (see report, section on cups)

# ---------------------------------------------------------------------------------------------
# 1. Elimination: elimination half-life in healthy adult control groups (oral caffeine; non-smokers
#    and women not using oral contraceptives where the study separates them). Study-level means
#    as reported in the abstracts (PMID). Used for the population-average half-life.
# ---------------------------------------------------------------------------------------------
HALF_LIVES = [  # (label, PMID, journal, t1/2 h, group)
    ("Parsons 1978", 657717, "Clin Pharmacol Ther", 6.0, "non-smokers"),
    ("Statland 1980", 7361718, "Am J Clin Pathol", 5.7, "healthy subjects"),
    ("Desmond 1980", 7371463, "Dig Dis Sci", 5.2, "healthy controls"),
    ("Knutti 1981", 7341280, "Eur J Clin Pharmacol", 3.4, "men and non-pregnant women (saliva)"),
    ("Newton 1981", 7333346, "Eur J Clin Pharmacol", np.log(2) / 0.163, "50 mg dose"),
    ("Mitchell 1983", 6854123, "J Lab Clin Med", 4.03, "baseline"),
    ("Renner 1984", 6420303, "Hepatology", 3.8, "normal volunteers"),
    ("Whitsett 1984", 6702647, "Am J Cardiol", 5.1, "non-smokers"),
    ("Abernethy 1985", 4029248, "Eur J Clin Pharmacol", 5.37, "women, no oral contraceptives"),
    ("Lelo 1986", 3756065, "Br J Clin Pharmacol", 4.1, "men"),
    ("Bruce 1986", 3741730, "Br J Clin Pharmacol", 5.0, "healthy (approximate)"),
    ("Mays 1987", 3690940, "Clin Pharmacol Ther", 5.6, "baseline"),
    ("Healy 1989", 2729942, "Antimicrob Agents Chemother", 5.2, "baseline"),
    ("Wahlländer 1989", 2612543, "Eur J Clin Pharmacol", 5.8, "controls"),
    ("Collomp 1991", 2060565, "Eur J Clin Pharmacol", 3.99, "at rest"),
    ("Mahr 1992", 1319876, "Clin Pharmacokinet", 4.5, "placebo phase"),
    ("Kamimori 1995", 7589033, "Eur J Clin Pharmacol", 6.7, "sea level"),
    ("Soto 1997", 9447474, "J Clin Pharm Ther", 5.3, "baseline"),
    ("Forsyth 2000", 11012552, "Br J Clin Pharmacol", 345 / 60, "healthy controls (saliva)"),
    ("Haller 2002", 12087345, "Clin Pharmacol Ther", 5.6, "no oral contraceptives"),
    ("Haller 2004", 15060505, "Clin Pharmacol Ther", 5.0, "men"),
    ("Culm-Merdek 2005", 16236038, "Br J Clin Pharmacol", 4.9, "placebo phase"),
    ("Seng 2009", 19125908, "J Clin Pharm Ther", 4.3, "non-smokers (population PK)"),
    ("White 2016", 27100333, "Clin Toxicol", np.mean([408, 411, 455, 450, 399]) / 60, "men and women, incl. OC users"),
    ("Thai 2021", 33951339, "Clin Pharmacol Drug Dev", 5.4, "placebo phase"),
]
hl = np.array([h[3] for h in HALF_LIVES])
T_HALF = float(np.median(hl))
T_HALF_Q1, T_HALF_Q3 = (float(x) for x in np.percentile(hl, [25, 75]))
KE = np.log(2) / T_HALF

# Volume of distribution (L/kg) reported for healthy adults.
VOLUMES = [("Lelo 1986", 0.675), ("Abernethy 1985", 0.750), ("White 2016", np.mean([0.623, 0.626, 0.642, 0.712, 0.708])),
           ("Seng 2009 (42 L, CL 114 mL/min, assumed 65 kg)", 114 * 60 / 1000 * 4.3 / np.log(2) / 65)]
V_KG = float(np.median([v for _, v in VOLUMES]))

# Inter-individual variability (Seng 2009, population PK): CV of CL 33 %, V 15 %, ka 51 %.
CV_CL, CV_V, CV_KA = 0.33, 0.15, 0.51

# ---------------------------------------------------------------------------------------------
# 2. Absorption: ka from reported times to peak after drinks and solutions. White 2016 drinks were
#    sipped over 2 or 20 min: tmax is counted from the middle of drinking.
# ---------------------------------------------------------------------------------------------
TMAX = [  # (label, tmax h, vehicle)
    ("Blanchard 1983, solution 5 mg/kg", 29.8 / 60, "solution"),
    ("Liguori 1997, coffee 400 mg (saliva)", 42 / 60, "coffee"),
    ("Liguori 1997, cola 400 mg (saliva)", 39 / 60, "cola"),
    ("Abernethy 1985, 162 mg (controls)", 0.79, "solution"),
    ("White 2016, hot coffee over 20 min", (59 - 10) / 60, "coffee"),
    ("White 2016, cold coffee over 2 min", (62 - 1) / 60, "coffee"),
    ("White 2016, cold coffee over 20 min", (64 - 10) / 60, "coffee"),
    ("White 2016, energy drink over 2 min", (70 - 1) / 60, "energy drink"),
    ("White 2016, energy drink over 20 min", (82 - 10) / 60, "energy drink"),
]
TMAX_MED = float(np.median([t for _, t, _ in TMAX]))

def tmax_of(ka, ke=KE):
    return np.log(ka / ke) / (ka - ke)

KA = brentq(lambda ka: tmax_of(ka) - TMAX_MED, KE * 1.01, 50)

# ---------------------------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------------------------
def body(t, ka=KA, ke=KE):
    t = np.asarray(t, float)
    out = np.where(t >= 0, ka / (ka - ke) * (np.exp(-ke * np.clip(t, 0, None)) - np.exp(-ka * np.clip(t, 0, None))), 0.0)
    return out

def gut(t, ka=KA):
    t = np.asarray(t, float)
    return np.where(t >= 0, np.exp(-ka * np.clip(t, 0, None)), 0.0)

def simulate(doses, t, ka=KA, ke=KE):
    """doses: list of (time h, mg). Returns (mg absorbed and not eliminated, mg still in the gut)."""
    b, g = np.zeros_like(t, float), np.zeros_like(t, float)
    for td, mg in doses:
        b += mg * body(t - td, ka, ke)
        g += mg * gut(t - td, ka)
    return b, g

def peak_factor(ka=KA, ke=KE):
    tm = tmax_of(ka, ke)
    return float(body(tm, ka, ke)), tm

# ---------------------------------------------------------------------------------------------
# 3. Validation against independent peak concentrations (not used for any parameter).
# ---------------------------------------------------------------------------------------------
PF, TM = peak_factor()
VALID = []  # (label, dose mg/kg, observed Cmax mg/L, predicted)
def add_valid(label, dose_mg_kg, cmax_obs):
    VALID.append((label, dose_mg_kg, cmax_obs, dose_mg_kg / V_KG * PF))
add_valid("Blanchard 1983 (solution, 5 mg/kg)", 5.0, 10.0)
add_valid("White 2016 hot coffee (160 mg, 74 kg)", 160 / 74, 3.74)
add_valid("White 2016 cold coffee 2 min", 160 / 74, 3.64)
add_valid("White 2016 cold coffee 20 min", 160 / 74, 3.56)
add_valid("White 2016 energy drink 2 min", 160 / 74, 3.36)
add_valid("White 2016 energy drink 20 min", 160 / 74, 3.14)
# Landolt 1995: 200 mg at 07:10 in nine men; saliva peak 17 umol/L at 1 h and 3 umol/L at 23:00.
# Saliva/plasma ratio 0.74 (Newton 1981). Weight not reported: 70 kg assumed.
SAL = 0.74
land_peak_obs = 17 * MW / 1000 / SAL
land_bed_obs = 3 * MW / 1000 / SAL
land_peak_pred = 200 / (V_KG * REF_WEIGHT) * float(body(1.0))
land_bed_pred = 200 / (V_KG * REF_WEIGHT) * float(body(23 + 0 / 60 - (7 + 10 / 60)))
VALID.append(("Landolt 1995 peak (200 mg, saliva, 70 kg assumed)", 200 / REF_WEIGHT, land_peak_obs, land_peak_pred))
VALID.append(("Landolt 1995 at 23:00, 15.8 h later", 200 / REF_WEIGHT, land_bed_obs, land_bed_pred))
ratios = np.array([p / o for _, _, o, p in VALID])

# Clearance implied by the model vs. reported values (mL/min/kg).
CL_MODEL = KE * V_KG * 1000 / 60
CL_REPORTED = [("Lelo 1986", 2.07), ("Abernethy 1985 (controls)", 1.75), ("White 2016 (5 arms)", 1.32),
               ("Wahlländer 1989 (controls)", 1.34), ("Newton 1981", 0.98), ("Faber 2004 (after quitting smoking)", 1.53),
               ("Seng 2009 (114 mL/min, 65 kg)", 114 / 65)]

# ---------------------------------------------------------------------------------------------
# 4. Sleep reference. Gardiner 2023 (meta-analysis): to avoid a reduction in total sleep time,
#    107 mg (coffee) >= 8.8 h before bed; 217.5 mg (pre-workout) >= 13.2 h before bed.
#    Amount predicted to be in the body at bedtime at those limits = level below which total sleep
#    time was not reduced on average. Landolt 1995 gives an independent measured level (above).
# ---------------------------------------------------------------------------------------------
g_coffee = 107 * float(body(8.8))
g_prew = 217.5 * float(body(13.2))
landolt_mg = land_bed_obs * V_KG * REF_WEIGHT  # measured concentration converted to mg at 70 kg
REF_MG = float(np.mean([g_coffee, g_prew]))
REF_MG_PER_KG = REF_MG / REF_WEIGHT
REF_CONC = REF_MG / (V_KG * REF_WEIGHT)
# Drake 2013: 400 mg 6 h before bed still disrupted sleep significantly.
drake_mg = 400 * float(body(6.0))

# ---------------------------------------------------------------------------------------------
# 5. Population variability: 10th-90th percentile band by Monte Carlo (log-normal CL, V, ka).
# ---------------------------------------------------------------------------------------------
rng = np.random.default_rng(7)
N = 4000
def lognorm(cv, n):
    s = np.sqrt(np.log(1 + cv ** 2)); return np.exp(rng.normal(-s * s / 2, s, n))
cl_i = KE * V_KG * lognorm(CV_CL, N)
v_i = V_KG * lognorm(CV_V, N)
ke_i = cl_i / v_i
ka_i = KA * lognorm(CV_KA, N)
ka_i = np.where(np.abs(ka_i - ke_i) < 1e-3, ka_i + 1e-3, ka_i)

def band(doses, t):
    out = np.zeros((N, len(t)))
    for i in range(N):
        out[i] = simulate(doses, t, ka_i[i], ke_i[i])[0]
    return np.percentile(out, [10, 50, 90], axis=0)

T_HALF_10, T_HALF_90 = (float(x) for x in np.percentile(np.log(2) / ke_i, [10, 90]))

# Studies report the mean of each person's own peak, which is higher than the peak of the typical
# person (variable ka and V). Like-for-like prediction: mean over simulated people of their own peak.
tm_i = np.log(ka_i / ke_i) / (ka_i - ke_i)
pf_i = ka_i / (ka_i - ke_i) * (np.exp(-ke_i * tm_i) - np.exp(-ka_i * tm_i))
POP_PEAK = float(np.mean(pf_i * V_KG / v_i))  # multiplier on dose/V_KG
POP_PEAK_RATIO = POP_PEAK / PF
VALID_POP = [(lab, d, o, d / V_KG * POP_PEAK if 'Landolt 1995 at' not in lab else p) for lab, d, o, p in VALID]
ratios_pop = np.array([p / o for _, _, o, p in VALID_POP])

# ---------------------------------------------------------------------------------------------
# Figures
# ---------------------------------------------------------------------------------------------
def fig_single():
    t = np.linspace(0, 24, 961)
    fig, ax = plt.subplots(figsize=(6.2, 2.6))
    for mg, ls in [(150, "-"), (75, "--")]:
        b, g = simulate([(0, mg)], t)
        ax.plot(t, b, color=C_BODY, ls=ls, lw=1.8, label=f"{mg} mg: absorbed, not yet eliminated")
        ax.plot(t, g, color=C_GUT, ls=ls, lw=1.2, label=f"{mg} mg: still in the gut")
    ax.axhline(REF_MG, color=C_REF, lw=0.8, ls=":")
    ax.text(23.8, REF_MG + 2, f"sleep reference ≈ {REF_MG:.0f} mg (70 kg)", color=C_REF, ha="right", fontsize=7.5)
    ax.set_xlabel("hours after drinking"); ax.set_ylabel("caffeine (mg)")
    ax.set_xlim(0, 24); ax.set_ylim(0, 155); ax.legend(fontsize=7.5, loc="upper right", bbox_to_anchor=(1, 0.92))
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "single_dose.pdf")); plt.close(fig)

def fig_halflives():
    order = np.argsort(hl)
    fig, ax = plt.subplots(figsize=(6.2, 3.6))
    y = np.arange(len(hl))
    ax.scatter(hl[order], y, color=C_BODY, s=14, zorder=3)
    ax.set_yticks(y); ax.set_yticklabels([HALF_LIVES[i][0] for i in order], fontsize=7)
    ax.axvline(T_HALF, color=C_REF, lw=1.2); ax.axvspan(T_HALF_Q1, T_HALF_Q3, color=C_REF, alpha=0.08)
    ax.text(T_HALF + 0.08, len(hl) - 0.6, f"median {T_HALF:.2f} h", color=C_REF, fontsize=7.5)
    ax.set_xlabel("reported mean elimination half-life (h)"); ax.set_xlim(2.5, 8)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "half_lives.pdf")); plt.close(fig)

def fig_validation():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.4, 2.8), gridspec_kw={"width_ratios": [1, 1.25]})
    obs = np.array([o for _, _, o, _ in VALID]); pred = np.array([p for _, _, _, p in VALID])
    lim = [0.3, 15]
    a1.loglog(lim, lim, color=C_GREY, lw=0.8); a1.fill_between(lim, [l / 1.25 for l in lim], [l * 1.25 for l in lim], color=C_GREY, alpha=0.12)
    a1.scatter(obs, pred, color=C_BODY, s=16, zorder=3)
    a1.set_xlim(lim); a1.set_ylim(lim); a1.set_xlabel("observed (mg/L)"); a1.set_ylabel("predicted (mg/L)")
    a1.set_title("peak and late concentrations", fontsize=8.5)
    t = np.linspace(0, 18, 721)
    b, _ = simulate([(0, 200)], t)
    lo, med, hi = band([(0, 200)], t)
    k = 1 / (V_KG * REF_WEIGHT)
    a2.fill_between(t, lo * k, hi * k, color=C_BODY, alpha=0.15, lw=0, label="10–90 % of people")
    a2.plot(t, b * k, color=C_BODY, lw=1.6, label="model, 200 mg, 70 kg")
    a2.scatter([1.0, 15 + 50 / 60], [land_peak_obs, land_bed_obs], color=C_ALT, zorder=4, s=18, label="Landolt 1995 (saliva ÷ 0.74)")
    a2.set_xlabel("hours after 200 mg"); a2.set_ylabel("plasma caffeine (mg/L)"); a2.legend(fontsize=7)
    a2.set_title("one dose in the morning", fontsize=8.5)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "validation.pdf")); plt.close(fig)

def fig_day():
    t = np.linspace(0, 32, 1281)  # 0 = 06:00
    doses = [(2.0, 150), (7.0, 75), (11.0, 150)]  # 08:00 big, 13:00 small, 17:00 big
    b, g = simulate(doses, t)
    lo, med, hi = band(doses, t)
    fig, ax = plt.subplots(figsize=(6.2, 2.7))
    ax.fill_between(t, lo, hi, color=C_BODY, alpha=0.15, lw=0, label="10–90 % of people")
    ax.plot(t, b, color=C_BODY, lw=1.8, label="model (typical person)")
    ax.plot(t, g, color=C_GUT, lw=1.0, label="still in the gut")
    ax.axhline(REF_MG, color=C_REF, lw=0.8, ls=":")
    ax.axvline(17, color=C_GREY, lw=0.8, ls="--"); ax.text(17.15, 262, "bedtime 23:00", fontsize=7.5, color=C_GREY)
    for td, mg in doses:
        ax.plot([td], [278], marker="v", color=C_BODY, ms=4); ax.text(td + 0.25, 272, f"{mg} mg", fontsize=7, color=C_BODY)
    ticks = np.arange(0, 33, 4); ax.set_xticks(ticks); ax.set_xticklabels([f"{(6 + int(x)) % 24}:00" for x in ticks])
    ax.set_ylabel("caffeine (mg)"); ax.set_xlim(0, 32); ax.set_ylim(0, 290); ax.legend(fontsize=7.5, loc="center right")
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "typical_day.pdf")); plt.close(fig)
    i = np.argmin(np.abs(t - 17)); j = np.argmin(np.abs(t - 17))
    return float(b[i]), float(lo[j]), float(hi[j])

def fig_sensitivity():
    t = np.linspace(0, 32, 1281)
    doses = [(2.0, 150), (7.0, 75), (11.0, 150)]
    fig, ax = plt.subplots(figsize=(6.2, 2.5))
    for th, lab, c in [(3.0, "3 h (e.g. heavy smokers)", C_GREY), (T_HALF, f"{T_HALF:.1f} h (population, used)", C_BODY),
                       (8.0, "8 h (e.g. oral contraceptives)", C_ALT), (10.0, "10 h (e.g. late pregnancy)", "#7a1f5c")]:
        ax.plot(t, simulate(doses, t, KA, np.log(2) / th)[0], color=c, lw=1.6 if th == T_HALF else 1.1, label=lab)
    ax.axhline(REF_MG, color=C_REF, lw=0.8, ls=":"); ax.axvline(17, color=C_GREY, lw=0.8, ls="--")
    ticks = np.arange(0, 33, 4); ax.set_xticks(ticks); ax.set_xticklabels([f"{(6 + int(x)) % 24}:00" for x in ticks])
    ax.set_ylabel("caffeine (mg)"); ax.set_xlim(0, 32); ax.legend(fontsize=7.5, title="half-life", title_fontsize=7.5)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "sensitivity.pdf")); plt.close(fig)

def fig_sleep():
    t = np.linspace(0, 16, 641)
    fig, ax = plt.subplots(figsize=(6.2, 2.5))
    ax.plot(t, 107 * body(t), color=C_BODY, lw=1.5, label="107 mg coffee")
    ax.plot(t, 217.5 * body(t), color=C_ALT, lw=1.5, label="217.5 mg pre-workout")
    ax.plot(t, 400 * body(t), color=C_GREY, lw=1.1, label="400 mg (Drake 2013)")
    for x, y, c, dy in [(8.8, g_coffee, C_BODY, -30), (13.2, g_prew, C_ALT, 22)]:
        ax.plot([x], [y], "o", color=c, ms=4); ax.annotate(f"{y:.0f} mg at {x} h", (x, y), xytext=(x - 0.9, y + dy), fontsize=7.5, color=c)
    ax.plot([6], [drake_mg], "o", color=C_GREY, ms=4); ax.annotate(f"{drake_mg:.0f} mg at 6 h:\nsleep still disrupted", (6, drake_mg), xytext=(6.3, drake_mg + 25), fontsize=7, color=C_GREY)
    ax.axhline(REF_MG, color=C_REF, lw=0.8, ls=":"); ax.text(0.15, REF_MG - 22, f"reference {REF_MG:.0f} mg", color=C_REF, ha="left", fontsize=7.5)
    ax.set_xlabel("hours between caffeine and bedtime"); ax.set_ylabel("caffeine in body (mg)")
    ax.set_ylim(0, 400); ax.set_xlim(0, 16); ax.legend(fontsize=7.5)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "sleep_reference.pdf")); plt.close(fig)

fig_single(); fig_halflives(); fig_validation(); fig_sensitivity(); fig_sleep()
DAY_BED, DAY_BED_LO, DAY_BED_HI = fig_day()

# Time for 150 mg to fall below the reference (typical person).
t_ref150 = brentq(lambda x: 150 * float(body(x)) - REF_MG, TM, 72)

# ---------------------------------------------------------------------------------------------
# 8. Version 2: smoking (option D for cigarettes only, report section "Smoking").
#    Elimination rate ke(t) = KE * M(t). M(t) follows CYP1A2 turnover towards a target set by the
#    cigarettes smoked in the last 24 h:
#        r(t)  = cigarettes in (t - 24 h, t]
#        M*(r) = 1 + EMAX * r / (EC50 + r)          (dose-response, fitted to Tantcheva-Poor 1999)
#        dM/dt = KDEG * (M* - M),  KDEG = ln 2 / 38.6 h  (Faber 2004, cessation of heavy smoking)
#    Snus / smokeless tobacco and nicotine replacement: no adjustment (no in-vivo induction).
# ---------------------------------------------------------------------------------------------
from scipy.optimize import curve_fit

# Caffeine clearance relative to non-smokers by cigarettes/day (Tantcheva-Poor 1999, n = 786, saliva
# caffeine clearance, analysis of covariance). Category midpoints; ">20" taken as 25.
SMOKE_TP = [("1--5", 3.0, 1.22), ("6--10", 8.0, 1.47), ("11--20", 15.5, 1.66), ("$>$20", 25.0, 1.72)]
# Independent check: hepatic CYP1A2 abundance by cigarettes/day relative to 0 (Plowchalk 2012: 52, 64, 79, 90, 94 pmol/mg).
SMOKE_PLOW = [(3.0, 64 / 52), (8.0, 79 / 52), (15.5, 90 / 52), (25.0, 94 / 52)]

def m_target(r, emax, ec50):
    return 1 + emax * np.asarray(r, float) / (ec50 + np.asarray(r, float))

_r = np.array([s[1] for s in SMOKE_TP]); _m = np.array([s[2] for s in SMOKE_TP])
(SM_EMAX, SM_EC50), _ = curve_fit(lambda r, e, c: np.log(m_target(r, e, c)), _r, np.log(_m), p0=[1, 8])
SM_EMAX, SM_EC50 = float(SM_EMAX), float(SM_EC50)
T_DEIND = 38.6                       # h, apparent half-life of CYP1A2 activity decrease (95 % CI 27.4-54.4)
KDEG = np.log(2) / T_DEIND
SM_WINDOW_DAYS = 28                  # cigarettes older than this no longer matter (2^-17)
SM_START_AVG_DAYS = 7                # before the first logged cigarette: steady state at the first week's rate

def M_ss(r):
    return float(m_target(r, SM_EMAX, SM_EC50))

# Smoker / non-smoker comparisons not used for the fit (clearance ratios; within = same people).
SMOKE_VALID = [  # (label, PMID, design, observed ratio, model ratio, note)
    ("Parsons 1978", 657717, "13 smokers vs 13 non-smokers", 155 / 94, M_ss(20), "cigarettes/day not given; 20 assumed"),
    ("Joeres 1988", 3371873, "8 smokers vs 15 non-smokers", 114 / 64, M_ss(20), "20 assumed"),
    ("Seng 2009", 19125908, "population PK, 59 men", (110 + 114) / 114, M_ss(20), "20 assumed"),
    ("Faber 2004", 15289794, "12 heavy smokers, before vs 13 d after quitting", 2.47 / 1.53, M_ss(25), "$\\geq$20/day"),
    ("Joeres 1988", 3371873, "7 smokers, before vs 3 weeks after quitting", 118 / 77, M_ss(20) / (1 + (M_ss(20) - 1) * np.exp(-KDEG * 21 * 24)), "20 assumed"),
    ("Benowitz 2003", 14586387, "12 smokers, smoking vs 7 d of air", 2.0 / 1.5, M_ss(20) / (1 + (M_ss(20) - 1) * np.exp(-KDEG * 7 * 24)), "20 assumed"),
    ("Brown 1988", 3365914, "9 smokers, 24-h AUC after 4 d abstinence", 1.46, M_ss(20) / (1 + (M_ss(20) - 1) * np.exp(-KDEG * 4 * 24)), "AUC ratio; 20 assumed"),
]

def smoking_M(cig_h, grid_h, now_h):
    """App algorithm (src/lib/caffeinePk.ts): M on a grid (hours), exact step for a piecewise constant target."""
    cig = np.sort(np.asarray(cig_h, float))
    cig = cig[cig <= now_h]
    M = np.ones_like(grid_h, dtype=float)
    if not len(cig):
        return M
    t0 = cig[0]
    span_d = min(SM_START_AVG_DAYS, max(1.0, (now_h - t0) / 24))
    r0 = np.sum(cig < t0 + span_d * 24) / span_d
    m = M_ss(r0); prev = None
    for i, t in enumerate(grid_h):
        tt = min(t, now_h)
        if tt <= t0:
            m = M_ss(r0)
        elif prev is not None and prev < tt:
            # Part of the 24-h window before the first logged cigarette counts at the assumed earlier rate r0.
            r = np.sum((cig > tt - 24) & (cig <= tt)) + r0 * max(0.0, t0 - (tt - 24)) / 24
            tgt = M_ss(r)
            m = tgt + (m - tgt) * np.exp(-KDEG * (tt - prev))
        M[i] = m
        prev = tt if tt > t0 else t0
    return M

def caffeine_with_M(doses, t, M_of_t):
    """Reference solution: integrate gut/body ODE with ke(t) = KE*M(t) (fine Euler-exponential steps)."""
    out = np.zeros_like(t); dt = t[1] - t[0]
    gut_amt = 0.0; bod = 0.0; di = sorted(doses)
    k = 0
    for i, ti in enumerate(t):
        while k < len(di) and di[k][0] <= ti + 1e-9:
            gut_amt += di[k][1]; k += 1
        out[i] = bod
        ke = KE * M_of_t(ti)
        a = gut_amt * KA * dt * np.exp(-KA * dt / 2)
        gut_amt *= np.exp(-KA * dt)
        bod = bod * np.exp(-ke * dt) + a * np.exp(-ke * dt / 2)
    return out

def caffeine_app(doses, t, lam_of_t, M_of_t):
    """App approximation: each dose uses ke at its own time for the absorption term, exact Lambda for elimination."""
    out = np.zeros_like(t)
    for td, D in doses:
        h = t - td; ok = h >= 0
        ke_i = KE * M_of_t(td)
        out[ok] += D * KA / (KA - ke_i) * (np.exp(-(lam_of_t(t[ok]) - lam_of_t(td))) - np.exp(-KA * h[ok]))
    return out

# Scenario for figures, checks and tests: 20 cigarettes/day 7:00-22:00 for 14 days, then stop (day 14, 0:00).
SC_DAYS = 21
sc_cigs = [d * 24 + 7 + j * 15 / 19 for d in range(14) for j in range(20)]
sc_grid = np.arange(0, SC_DAYS * 24 + 1e-9, 0.25)
sc_now = SC_DAYS * 24
sc_M = smoking_M(sc_cigs, sc_grid, sc_now)
SC_M_SMOKING = float(np.interp(13 * 24 + 23, sc_grid, sc_M))
SC_M_2D = float(np.interp(16 * 24, sc_grid, sc_M))
SC_M_7D = float(np.interp(21 * 24, sc_grid, sc_M))
SC_THALF_SMOKING = T_HALF / SC_M_SMOKING

# Compare app approximation with the ODE: 150 mg at 8:00 and 150 mg at 14:00 on day 13 (smoking) and day 15 (quitting).
_lam_cum = np.concatenate([[0], np.cumsum(KE * (sc_M[1:] + sc_M[:-1]) / 2 * np.diff(sc_grid))])
lam_of_t = lambda x: np.interp(x, sc_grid, _lam_cum)
M_of_t = lambda x: float(np.interp(x, sc_grid, sc_M))
sc_doses = [(13 * 24 + 8, 150.0), (13 * 24 + 14, 150.0), (15 * 24 + 8, 150.0), (15 * 24 + 14, 150.0)]
_tt = np.arange(12 * 24, 17 * 24, 1 / 60)
_ode = caffeine_with_M(sc_doses, _tt, M_of_t)
_app = caffeine_app(sc_doses, _tt, lam_of_t, M_of_t)
SC_MAX_ERR_MG = float(np.max(np.abs(_ode - _app)))
SC_BODY = {lab: float(np.interp(h, _tt, _app)) for lab, h in
           [("day13_20h", 13 * 24 + 20), ("day15_20h", 15 * 24 + 20), ("day13_23h", 13 * 24 + 23)]}
# Same doses without smoking (baseline) at 23:00 on day 13.
SC_BODY_BASE_23 = float(150 * body(15) + 150 * body(9))

def fig_smoking():
    fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.7))
    rr = np.linspace(0, 40, 200)
    ax[0].plot(rr, m_target(rr, SM_EMAX, SM_EC50), color=C_BODY, label="model $M^*(r)$")
    ax[0].plot(_r, _m, "o", color=C_BODY, ms=4, label="Tantcheva-Poór 1999 (fit)")
    ax[0].plot([p[0] for p in SMOKE_PLOW], [p[1] for p in SMOKE_PLOW], "s", mfc="none", color=C_REF, ms=4,
               label="Plowchalk 2012 (CYP1A2 abundance)")
    ax[0].set_xlabel("cigarettes in the last 24 h"); ax[0].set_ylabel("caffeine clearance vs. non-smoker")
    ax[0].set_ylim(0.9, 2.1); ax[0].legend(fontsize=6.5, loc="lower right"); ax[0].set_title("a  dose-response", fontsize=9, loc="left")
    d = sc_grid / 24
    ax[1].plot(d, T_HALF / sc_M, color=C_BODY)
    ax[1].axhline(T_HALF, color=C_GREY, ls=":", lw=1); ax[1].text(0.3, T_HALF + 0.1, "non-smoker", fontsize=7, color=C_GREY)
    ax[1].axvline(14, color=C_ALT, ls="--", lw=1); ax[1].text(13.7, 4.3, "stops\nsmoking", fontsize=7, color=C_ALT, ha="right")
    ax[1].set_xlabel("day"); ax[1].set_ylabel("caffeine half-life (h)"); ax[1].set_ylim(2.5, 5.8)
    ax[1].set_title("b  20 cigarettes/day, then quitting", fontsize=9, loc="left")
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "smoking.pdf")); plt.close(fig)
fig_smoking()

# ---------------------------------------------------------------------------------------------
# 9. Drinking time (report section "Drinking time"): a drink of D mg sipped at an even pace over T h,
#    starting at the logged time. Input rate D/T into the gut for T h, then the same model.
#    With u = min(t, T):
#      gut(t)     = D/T * (exp(-ka (t-u)) - exp(-ka t)) / ka
#      body(t)    = D/T * ka/(ka-ke) * [exp(-ke (t-u)) (1 - exp(-ke u)) / ke - (exp(-ka (t-u)) - exp(-ka t)) / ka]
#      undrunk(t) = D * (1 - u/T)
#    T -> 0 gives the single-dose formulas.
# ---------------------------------------------------------------------------------------------
def body_sip(t, T, ka=KA, ke=KE):
    t = np.asarray(t, float)
    if T <= 0:
        return body(t, ka, ke)
    tc = np.clip(t, 0, None); u = np.minimum(tc, T)
    absorbed = (np.exp(-ka * (tc - u)) - np.exp(-ka * tc)) / ka
    remaining = np.exp(-ke * (tc - u)) * (-np.expm1(-ke * u)) / ke
    return np.where(t >= 0, ka / (ka - ke) * (remaining - absorbed) / T, 0.0)

def gut_sip(t, T, ka=KA):
    t = np.asarray(t, float)
    if T <= 0:
        return gut(t, ka)
    tc = np.clip(t, 0, None); u = np.minimum(tc, T)
    return np.where(t >= 0, (np.exp(-ka * (tc - u)) - np.exp(-ka * tc)) / ka / T, 0.0)

def undrunk_sip(t, T):
    t = np.asarray(t, float)
    return np.where(t >= 0, 1 - np.minimum(np.clip(t, 0, None), T) / T, 1.0)

# Check the closed form against many small sips (midpoint rule, 4000 sips).
_ts = np.linspace(0, 24, 2401)
_sips = (np.arange(4000) + 0.5) / 4000
SIP_MAX_ERR = 0.0
for _T in (0.25, 1.0, 2.0):
    _num = np.mean([body(_ts - s * _T) for s in _sips], axis=0)
    SIP_MAX_ERR = max(SIP_MAX_ERR, float(150 * np.max(np.abs(_num - body_sip(_ts, _T)))))

def sip_summary(T, D=150.0):
    tt = np.arange(0, 24, 1 / 600)
    b = D * body_sip(tt, T)
    i = int(np.argmax(b))
    return {"peak": float(b[i]), "tmax_min": float(tt[i] * 60), "h1": float(D * body_sip(1, T)),
            "h6": float(D * body_sip(6, T)), "h9": float(D * body_sip(9, T)), "h12": float(D * body_sip(12, T))}
SIP_ROWS = [(m, sip_summary(m / 60)) for m in (0, 15, 30, 60, 120)]
SIP = dict(SIP_ROWS)

# White 2016 sipped over 2 and 20 min; ka was set with tmax counted from the middle of drinking.
# Model tmax counted from the start of drinking, for comparison with the observed values.
SIP_WHITE = [(lab, m, obs, sip_summary(m / 60)["tmax_min"]) for lab, m, obs in
             [("cold coffee / energy drink over 2 min", 2, "62 / 70"),
              ("hot / cold coffee / energy drink over 20 min", 20, "59 / 64 / 82")]]

# With smoking the app keeps ke at its value at the start of drinking within the drinking time.
# Compare with a direct numerical solution for the smoking scenario of section 8, each 150 mg drink sipped over 1 h.
def caffeine_with_M_sip(doses, t, M_of_t):
    """Reference: gut/body ODE (explicit small steps) with input rate D/T during [t_i, t_i + T] and ke(t) = KE*M(t)."""
    out = np.zeros_like(t); dt = t[1] - t[0]; g = 0.0; b = 0.0
    for i, ti in enumerate(t):
        out[i] = b
        inp = sum(D / T * max(0.0, min(ti + dt, td + T) - max(ti, td)) for td, D, T in doses)
        ke = KE * M_of_t(ti)
        a = KA * g * dt
        g += inp - a
        b += a - ke * b * dt
    return out

def caffeine_app_sip(doses, t, lam_of_t, M_of_t):
    out = np.zeros_like(t)
    for td, D, T in doses:
        h = t - td; ok = h >= 0
        ke_i = KE * M_of_t(td)
        u = np.minimum(h[ok], T)
        absorbed = (np.exp(-KA * (h[ok] - u)) - np.exp(-KA * h[ok])) / KA
        remaining = np.exp(-(lam_of_t(t[ok]) - lam_of_t(td + u))) * (-np.expm1(-ke_i * u)) / ke_i
        out[ok] += D / T * KA / (KA - ke_i) * (remaining - absorbed)
    return out

sc_sip = [(td, D, 1.0) for td, D in sc_doses]
_tt2 = np.arange(12 * 24, 17 * 24, 1 / 600)
_ode2 = caffeine_with_M_sip(sc_sip, _tt2, M_of_t)
_app2 = caffeine_app_sip(sc_sip, _tt2, lam_of_t, M_of_t)
SIP_SMOKE_MAX_ERR = float(np.max(np.abs(_ode2 - _app2)))
SIP_SMOKE_BODY = {lab: float(np.interp(h, _tt2, _app2)) for lab, h in
                  [("day13_20h", 13 * 24 + 20), ("day15_20h", 15 * 24 + 20)]}

def fig_drink_time():
    fig, ax = plt.subplots(figsize=(5.6, 2.6))
    tt = np.linspace(0, 14, 1401)
    for (m, col, ls) in [(0, C_BODY, "-"), (30, C_ALT, "-"), (60, C_REF, "-"), (120, C_GREY, "--")]:
        lab = "all at once" if m == 0 else f"sipped over {m} min"
        ax.plot(tt, 150 * body_sip(tt, m / 60), color=col, ls=ls, lw=1.3, label=lab)
    ax.set_xlabel("hours since the start of drinking"); ax.set_ylabel("caffeine in the body (mg)")
    ax.set_xlim(0, 14); ax.set_ylim(0, 145); ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(os.path.join(FIG, "drink_time.pdf")); plt.close(fig)
fig_drink_time()

# ---------------------------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------------------------
N_ = {
    "nStudiesHL": len(HALF_LIVES), "tHalf": f"{T_HALF:.2f}", "tHalfQone": f"{T_HALF_Q1:.1f}", "tHalfQthree": f"{T_HALF_Q3:.1f}",
    "tHalfMin": f"{hl.min():.1f}", "tHalfMax": f"{hl.max():.1f}",
    "ke": f"{KE:.4f}", "ka": f"{KA:.2f}", "tmaxMed": f"{TMAX_MED * 60:.0f}", "tmaxModel": f"{TM * 60:.0f}",
    "Vkg": f"{V_KG:.3f}", "CLmodel": f"{CL_MODEL:.2f}", "peakFrac": f"{PF:.3f}",
    "ratioMed": f"{np.median(ratios):.2f}", "ratioMin": f"{ratios.min():.2f}", "ratioMax": f"{ratios.max():.2f}",
    "within": f"{int(np.sum((ratios > 0.8) & (ratios < 1.25)))}", "nValid": f"{len(VALID)}",
    "popPeakRatio": f"{POP_PEAK_RATIO:.2f}", "ratioPopMed": f"{np.median(ratios_pop):.2f}",
    "ratioPopMin": f"{ratios_pop.min():.2f}", "ratioPopMax": f"{ratios_pop.max():.2f}",
    "withinPop": f"{int(np.sum((ratios_pop > 0.8) & (ratios_pop < 1.25)))}",
    "landoltHalf": f"{14.8 * np.log(2) / np.log(17 / 3):.1f}",
    "gCoffee": f"{g_coffee:.0f}", "gPrew": f"{g_prew:.0f}", "landoltMg": f"{landolt_mg:.0f}", "drakeMg": f"{drake_mg:.0f}",
    "refMg": f"{REF_MG:.0f}", "refMgKg": f"{REF_MG_PER_KG:.2f}", "refConc": f"{REF_CONC:.2f}",
    "dayBed": f"{DAY_BED:.0f}", "dayBedLo": f"{DAY_BED_LO:.0f}", "dayBedHi": f"{DAY_BED_HI:.0f}",
    "tHalfTen": f"{T_HALF_10:.1f}", "tHalfNinety": f"{T_HALF_90:.1f}", "tRefOneFifty": f"{t_ref150:.1f}",
    "cupMg": f"{CUP_MG:.0f}",
    "smEmax": f"{SM_EMAX:.2f}", "smEcfifty": f"{SM_EC50:.1f}", "smTdeind": f"{T_DEIND:.1f}",
    "smMten": f"{M_ss(10):.2f}", "smMtwenty": f"{M_ss(20):.2f}", "smMforty": f"{M_ss(40):.2f}", "smMfive": f"{M_ss(5):.2f}",
    "smThalfTen": f"{T_HALF / M_ss(10):.1f}", "smThalfTwenty": f"{T_HALF / M_ss(20):.1f}", "smThalfFive": f"{T_HALF / M_ss(5):.1f}",
    "smScM": f"{SC_M_SMOKING:.2f}", "smScMtwo": f"{SC_M_2D:.2f}", "smScMseven": f"{SC_M_7D:.2f}",
    "smMaxErr": f"{SC_MAX_ERR_MG:.2f}", "smBedSmoke": f"{SC_BODY['day13_23h']:.0f}", "smBedBase": f"{SC_BODY_BASE_23:.0f}",
    "smWindow": f"{SM_WINDOW_DAYS}", "smStartAvg": f"{SM_START_AVG_DAYS}",
    "sipMaxErr": f"{SIP_MAX_ERR:.1e}", "sipSmokeMaxErr": f"{SIP_SMOKE_MAX_ERR:.2f}",
    "sipBedZero": f"{SIP[0]['h9']:.0f}", "sipBedSixty": f"{SIP[60]['h9']:.0f}",
    "sipBedPct": f"{100 * (SIP[60]['h9'] / SIP[0]['h9'] - 1):.0f}",
}
with open(os.path.join(HERE, "numbers.tex"), "w") as f:
    for k, v in N_.items():
        f.write("\\newcommand{\\n%s}{%s}\n" % (k[0].upper() + k[1:], v))

def tex_escape(s):
    return s.replace("&", "\\&").replace("%", "\\%")
with open(os.path.join(HERE, "tables.tex"), "w") as f:
    f.write("\\newcommand{\\halflifetable}{%\n")
    for lab, pmid, j, h, grp in HALF_LIVES:
        f.write(f"{lab} & \\emph{{{tex_escape(j)}}} & {tex_escape(grp)} & {h:.2f} & {pmid}\\\\\n")
    f.write("}\n\\newcommand{\\validtable}{%\n")
    for lab, d, o, p in VALID:
        f.write(f"{tex_escape(lab)} & {o:.2f} & {p:.2f} & {p / o:.2f}\\\\\n")
    f.write("}\n\\newcommand{\\tmaxtable}{%\n")
    for lab, t, v in TMAX:
        f.write(f"{tex_escape(lab)} & {t * 60:.0f}\\\\\n")
    f.write("}\n\\newcommand{\\cltable}{%\n")
    for lab, v in CL_REPORTED:
        f.write(f"{tex_escape(lab)} & {v:.2f}\\\\\n")
    f.write("}\n\\newcommand{\\smoketable}{%\n")
    for lab, pmid, design, o, m, note in SMOKE_VALID:
        f.write(f"{lab} & {tex_escape(design)} & {o:.2f} & {m:.2f} & {m / o:.2f} & {note}\\\\\n")
    f.write("}\n\\newcommand{\\siptable}{%\n")
    for m, r in SIP_ROWS:
        name = "all at once" if m == 0 else f"{m} min"
        f.write(f"{name} & {r['peak']:.0f} & {r['tmax_min']:.0f} & {r['h1']:.0f} & {r['h6']:.1f} & {r['h9']:.1f} & {r['h12']:.1f}\\\\\n")
    f.write("}\n\\newcommand{\\sipwhitetable}{%\n")
    for lab, m, obs, mod in SIP_WHITE:
        f.write(f"White 2016, {lab} & {obs} & {mod:.0f}\\\\\n")
    f.write("}\n\\newcommand{\\voltable}{%\n")
    for lab, v in VOLUMES:
        f.write(f"{tex_escape(lab)} & {v:.2f}\\\\\n")
    f.write("}\n")

json.dump({
    "model": "one-compartment, first-order absorption and elimination, F = 1",
    "KA_PER_H": round(KA, 4), "KE_PER_H": round(KE, 5), "T_HALF_H": round(T_HALF, 3),
    "V_L_PER_KG": round(V_KG, 3), "DEFAULT_WEIGHT_KG": REF_WEIGHT,
    "SLEEP_REF_MG_PER_KG": round(REF_MG_PER_KG, 4), "CUP_MG": CUP_MG,
    "IGNORE_DOSES_OLDER_THAN_H": 72,
    "formulas": {
        "body_mg": "sum_i D_i * KA/(KA-KE) * (exp(-KE*t_i) - exp(-KA*t_i)), t_i = hours since dose i (t_i >= 0)",
        "gut_mg": "sum_i D_i * exp(-KA*t_i)",
        "plasma_mg_per_l": "body_mg / (V_L_PER_KG * weight_kg)",
        "sleep_ref_mg": "SLEEP_REF_MG_PER_KG * weight_kg",
        "cups": "body_mg / CUP_MG",
    },
    "check_values": {"150mg_after_1h": round(150 * float(body(1)), 2), "150mg_after_6h": round(150 * float(body(6)), 2),
                     "150mg_after_12h": round(150 * float(body(12)), 2), "gut_150mg_after_0.5h": round(150 * float(gut(0.5)), 2)},
    "drink_time": {
        "model": "entry sipped at an even pace over T h from takenAt (the start of drinking); t_i = hours since the start; "
                 "u = min(t_i, T); gut = D/T*(exp(-KA*(t_i-u)) - exp(-KA*t_i))/KA; "
                 "body = D/T*KA/(KA-ke_i)*(exp(-Lambda(start+u, t))*(1-exp(-ke_i*u))/ke_i - (exp(-KA*(t_i-u)) - exp(-KA*t_i))/KA), "
                 "ke_i = ke at the start, Lambda = integral of ke (KE*(t_i-u) without smoking); undrunk = D*(1-u/T); T = 0: single dose",
        "check_values": {
            "150mg_60min_after_0.5h": round(150 * float(body_sip(0.5, 1.0)), 2),
            "150mg_60min_after_1h": round(150 * float(body_sip(1, 1.0)), 2),
            "150mg_60min_after_6h": round(150 * float(body_sip(6, 1.0)), 2),
            "150mg_60min_after_12h": round(150 * float(body_sip(12, 1.0)), 2),
            "gut_150mg_60min_after_0.5h": round(150 * float(gut_sip(0.5, 1.0)), 2),
            "undrunk_150mg_60min_after_0.5h": round(150 * float(undrunk_sip(0.5, 1.0)), 2),
            "smoking_scenario_60min_body_day13_20h": round(SIP_SMOKE_BODY["day13_20h"], 2),
            "smoking_scenario_60min_body_day15_20h": round(SIP_SMOKE_BODY["day15_20h"], 2),
            "max_error_vs_ode_smoking_mg": round(SIP_SMOKE_MAX_ERR, 3),
        },
    },
    "smoking": {
        "model": "ke(t) = KE*M(t); r = cigarettes in the last 24 h; M* = 1 + EMAX*r/(EC50+r); dM/dt = KDEG*(M* - M); "
                 "r0 = average cigarettes/day over the first START_AVG_DAYS after the first logged cigarette (span at least 1 day); before that cigarette M = M*(r0), and the part of the 24-h window before it counts r0 per day; "
                 "after now M stays at M(now); snus is not counted",
        "EMAX": round(SM_EMAX, 4), "EC50_CIG_PER_DAY": round(SM_EC50, 3), "T_HALF_DEINDUCTION_H": T_DEIND,
        "KDEG_PER_H": round(float(KDEG), 6), "WINDOW_DAYS": SM_WINDOW_DAYS, "START_AVG_DAYS": SM_START_AVG_DAYS,
        "check_values": {
            "scenario": "20 cigarettes/day at 7:00 + j*15/19 h (j = 0..19) on days 0-13, then none; t in hours from day 0 0:00; "
                        "caffeine 150 mg at 13d 8:00, 13d 14:00, 15d 8:00, 15d 14:00",
            "M_target_10": round(M_ss(10), 4), "M_target_20": round(M_ss(20), 4),
            "M_day13_23h": round(SC_M_SMOKING, 4), "M_day16_0h": round(SC_M_2D, 4), "M_day21_0h": round(SC_M_7D, 4),
            "body_day13_20h": round(SC_BODY["day13_20h"], 2), "body_day15_20h": round(SC_BODY["day15_20h"], 2),
            "body_day13_23h": round(SC_BODY["day13_23h"], 2), "max_error_vs_ode_mg": round(SC_MAX_ERR_MG, 3),
        },
    },
}, open(os.path.join(HERE, "ts_constants.json"), "w"), indent=2, ensure_ascii=False)

print(json.dumps(N_, indent=1, ensure_ascii=False))
for row in SMOKE_VALID:
    print(f"  {row[0]:15s} {row[2]:50s} obs {row[3]:.2f} model {row[4]:.2f} ratio {row[4] / row[3]:.2f}")
for (lab, d, o, p), (_, _, _, pp) in zip(VALID, VALID_POP):
    print(f"  {lab:55s} obs {o:6.2f} typical {p:6.2f} pop-mean {pp:6.2f} ratio {pp / o:.2f}")
for m, r in SIP_ROWS:
    print(f"  sip {m:3d} min: " + ", ".join(f"{k} {v:.1f}" for k, v in r.items()))
for row in SIP_WHITE:
    print("  White", row)
print("  sip max err", SIP_MAX_ERR, "smoking sip max err", SIP_SMOKE_MAX_ERR)
