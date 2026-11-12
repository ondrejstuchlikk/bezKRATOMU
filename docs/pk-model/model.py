"""Kratom PK model: calibration, validation, figures and closed-form coefficients.
Run: python3 -I docs/pk-model/model.py  (writes fig/*.pdf and numbers.tex next to this file)"""
import json, os
import numpy as np
from scipy.linalg import expm
from scipy.optimize import least_squares
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, "fig")
plt.rcParams.update({"font.family": "serif", "font.size": 9, "axes.spines.top": False,
                     "axes.spines.right": False, "figure.dpi": 150, "legend.frameon": False})
C_MG, C_OH, C_E, C_GREY = "#1f5aa6", "#c2410c", "#111111", "#888888"

# --- Notario et al. 2026 (ADMET DMPK 14:3170), posterior medians (Table 2) and SDs ---
P = dict(ka=1.99, CL=17.85, Vc=115.71, Q=10.76, Vp=355.64,
         CLm=106.29, Vcm=50.61, Qm=8.52, Vpm=71.76, Fm=0.65)
P_SD = dict(ka=0.72, CL=2.23, Vc=21.26, Q=2.08, Vp=69.81,
            CLm=23.47, Vcm=28.49, Qm=6.54, Vpm=58.62, Fm=0.14)
P_MEAN = dict(ka=2.11, CL=18.01, Vc=117.98, Q=11.03, Vp=358.87,
              CLm=108.03, Vcm=57.37, Qm=10.11, Vpm=87.57, Fm=0.66)
MW_MG, MW_OH = 398.5, 414.5           # g/mol
EC50_MG, EC50_OH = 339.0, 34.5        # nM, human MOR G-protein activation (Kruegel 2016)
W = EC50_MG / EC50_OH                 # potency weight of 7-OH relative to MG
F_MG_CONTENT = 0.016                  # user's product: 1.6 % mitragynine
F_OH_CONTENT = 0.00001                # 0.001 % 7-OH

def A_matrix(p):
    k10, k12, k21 = p["CL"]/p["Vc"], p["Q"]/p["Vc"], p["Q"]/p["Vp"]
    m10, m12, m21 = p["CLm"]/p["Vcm"], p["Qm"]/p["Vcm"], p["Qm"]/p["Vpm"]
    A = np.zeros((5, 5))
    A[0, 0] = -p["ka"]
    A[1, 0] = p["ka"]; A[1, 1] = -(k10+k12); A[1, 2] = k21
    A[2, 1] = k12;     A[2, 2] = -k21
    A[3, 1] = p["Fm"]*k10; A[3, 3] = -(m10+m12); A[3, 4] = m21
    A[4, 3] = m12;     A[4, 4] = -m21
    return A

def impulse(p, t):
    """Concentrations (ng/mL) per 1 mg MG reaching the gut (amounts in ug -> ug/L = ng/mL)."""
    A = A_matrix(p); x0 = np.array([1000.0, 0, 0, 0, 0])
    lam, V = np.linalg.eig(A)
    c = np.linalg.solve(V, x0)
    X = (V * c) @ np.exp(np.outer(lam, t))     # 5 x len(t)
    X = np.real(X)
    return X[1]/p["Vc"], X[3]/p["Vcm"]

def simulate(doses, t, p=P, F=1.0, s=1.0):
    """doses: list of (time_h, mg MG). Superposition of impulse responses."""
    cm, co = np.zeros_like(t), np.zeros_like(t)
    for td, mg in doses:
        tau = t - td; m = tau >= 0
        a, b = impulse(p, tau[m])
        cm[m] += F*mg*a; co[m] += s*F*mg*b
    return cm, co

def nc_metrics(t, c):
    i = np.argmax(c); return c[i], t[i], np.trapezoid(c, t)

# --- Huestis 2024 single dose (means) and multiple dose (means), leaf powder capsules ---
H_D = np.array([6.65, 13.3, 26.6, 53.2])
H_SD = dict(mg_cmax=[17.1, 32.1, 57.0, 125], mg_auc=[52.8, 136, 364, 908],
            oh_cmax=[3.6, 6.6, 10.8, 22.7], oh_auc=[11.2, 28.8, 58.2, 136],
            mg_tmax=[1.0, 1.3, 1.3, 1.3], oh_tmax=[1.2, 1.5, 1.8, 1.7])
H_MD = dict(mg_cmax=[21.4, 33.5, 74.6, 143], mg_tr=[1.40, 2.74, 7.70, 20.5], mg_auc=[85.1, 175, 457, 958],
            oh_cmax=[3.2, 5.9, 11.3, 21.8], oh_tr=[0.0, 0.1, 0.6, 1.7], oh_auc=[10.1, 28.0, 67.8, 133])
# Mongar 2024 tea, 23.6 mg (geometric means) -- the dataset Notario fitted
M_TEA = dict(mg_cmax=159.12, mg_tmax=0.84, mg_auc=940.42, oh_cmax=12.81, oh_tmax=1.77, oh_auc=171.63)

T = np.linspace(0, 400, 40001)   # 0.01 h grid, long enough for AUC to infinity (~)
u_mg, u_oh = impulse(P, T)
cmax1_mg, tmax_mg, auc1_mg = nc_metrics(T, u_mg)
cmax1_oh, tmax_oh, auc1_oh = nc_metrics(T, u_oh)

def resid(x):
    F, s = np.exp(x)
    r = []
    for i, d in enumerate(H_D):
        r += [np.log(F*d*cmax1_mg/H_SD["mg_cmax"][i]), np.log(F*d*auc1_mg/H_SD["mg_auc"][i]),
              np.log(s*F*d*cmax1_oh/H_SD["oh_cmax"][i]), np.log(s*F*d*auc1_oh/H_SD["oh_auc"][i])]
    return r
fit = least_squares(resid, [np.log(0.3), np.log(2)])
F_REL, S_OH = np.exp(fit.x)
fit_rmse = float(np.sqrt(np.mean(np.square(fit.fun))))

out = {}
out["tea"] = dict(mg_cmax=23.6*cmax1_mg, mg_tmax=tmax_mg, mg_auc=23.6*auc1_mg,
                  oh_cmax=23.6*cmax1_oh, oh_tmax=tmax_oh, oh_auc=23.6*auc1_oh)
out["sd"] = [dict(mg_cmax=F_REL*d*cmax1_mg, mg_auc=F_REL*d*auc1_mg,
                  oh_cmax=S_OH*F_REL*d*cmax1_oh, oh_auc=S_OH*F_REL*d*auc1_oh) for d in H_D]
# multiple dose: 15 daily doses, metrics over the 15th dosing interval
Tm = np.arange(0, 15*24 + 0.001, 0.02)
md = []
for d in H_D:
    cm, co = simulate([(24*k, d) for k in range(15)], Tm, F=F_REL, s=S_OH)
    w = Tm >= 14*24
    md.append(dict(mg_cmax=cm[w].max(), mg_tr=cm[-1], mg_auc=np.trapezoid(cm[w], Tm[w]),
                   oh_cmax=co[w].max(), oh_tr=co[-1], oh_auc=np.trapezoid(co[w], Tm[w])))
out["md"] = md

# eigen-decomposition -> closed form h(t) = sum_k a_k exp(-lam_k t) per 1 g of user's powder
A = A_matrix(P); lam, V = np.linalg.eig(A); c0 = np.linalg.solve(V, np.array([1000.0, 0, 0, 0, 0]))
lam = np.real(lam); coefMG = np.real(V[1]*c0)/P["Vc"]; coefOH = np.real(V[3]*c0)/P["Vcm"]
order = np.argsort(-lam); lam, coefMG, coefOH = lam[order], coefMG[order], coefOH[order]
mg_per_g = 1000*F_MG_CONTENT
# combined MOR-equivalent index per gram, nM: E = C_MG/MW + W*C_OH/MW_OH (ng/mL -> nM: *1000/MW)
coefE = F_REL*mg_per_g*(coefMG*1000/MW_MG + W*S_OH*coefOH*1000/MW_OH)
# amounts still in the body per gram of powder (dose-equivalent: assumes complete absorption, so F_rel is NOT applied)
amtMG = mg_per_g*np.real((V[1]+V[2])*c0)[order]/1000          # mg MG in central+peripheral
amtOH = mg_per_g*S_OH*np.real((V[3]+V[4])*c0)[order]/1000     # mg 7-OH in central+peripheral
out["coef"] = dict(amtMG=list(amtMG), amtOH=list(amtOH), neg_lambda=list(-lam*-1), lam=list(-lam), coefMG=list(coefMG), coefOH=list(coefOH), coefE=list(coefE))

def E_from(cm, co): return cm*1000/MW_MG + W*co*1000/MW_OH
# reference R per gram/day: steady-state peak, once daily dosing
Tss = np.arange(0, 30*24 + 0.001, 0.01)
cm, co = simulate([(24*k, mg_per_g) for k in range(30)], Tss, F=F_REL, s=S_OH)
Ess = E_from(cm, co); last = Tss >= 29*24
R_PEAK = Ess[last].max()
R_PER_G = np.trapezoid(Ess[last], Tss[last])/24   # steady-state DAILY MEAN of E per g/day (independent of dose splitting)
out["R_per_g_nM"] = R_PER_G; out["R_peak_per_g_nM"] = R_PEAK
E1 = E_from(*simulate([(0, mg_per_g)], T, F=F_REL, s=S_OH))
out["E_single_peak_per_g"] = E1.max(); out["E_single_tmax"] = T[np.argmax(E1)]
out["accum_peak"] = R_PEAK/E1.max(); out["single_peak_rel"] = E1.max()/R_PER_G; out["ss_peak_rel"] = R_PEAK/R_PER_G
# share of E from 7-OH (AUC-based, single dose)
cm1, co1 = simulate([(0, mg_per_g)], T, F=F_REL, s=S_OH)
out["share_OH_auc"] = np.trapezoid(W*co1*1000/MW_OH, T)/np.trapezoid(E1, T)
out["share_OH_peak"] = (W*co1*1000/MW_OH)[np.argmax(E1)]/E1.max()
# direct 7-OH in the powder, upper bound (F=1 for 7-OH, same CLm): AUC ratio direct/formed
out["direct_OH_upper"] = (F_OH_CONTENT*1000)/(S_OH*F_REL*mg_per_g*P["Fm"])
# shape: % of single-dose peak at given times
tt = [1, 2, 4, 6, 8, 12, 24, 48, 72, 168]
out["shape_E"] = {h: float(100*E1[int(round(h/0.01))]/E1.max()) for h in tt}
out["shape_MG"] = {h: float(100*cm1[int(round(h/0.01))]/cm1.max()) for h in tt}
out["shape_OH"] = {h: float(100*co1[int(round(h/0.01))]/co1.max()) for h in tt}
# washout after steady state at baseline once daily: % of R at times after last dose
Tw = np.arange(0, 30*24 + 21*24, 0.05)
cm, co = simulate([(24*k, mg_per_g) for k in range(30)], Tw, F=F_REL, s=S_OH)
Ew = E_from(cm, co)/R_PER_G*100; t_last = 29*24
out["washout"] = {d: float(Ew[int(round((t_last + 24*d)/0.05))]) for d in [1, 2, 3, 7, 14]}
# memory window: dose older than N days contributes < x% of single-dose peak
for days in [7, 10, 14]:
    out[f"tail_{days}d_pct"] = float(100*E1[int(round(24*days/0.01))]/E1.max()) if 24*days <= 400 else None
# macro rate constants
k10, k12, k21 = P["CL"]/P["Vc"], P["Q"]/P["Vc"], P["Q"]/P["Vp"]
ssum, prod = k10+k12+k21, k10*k21
alpha = (ssum + np.sqrt(ssum**2-4*prod))/2; beta = (ssum - np.sqrt(ssum**2-4*prod))/2
m10, m12, m21 = P["CLm"]/P["Vcm"], P["Qm"]/P["Vcm"], P["Qm"]/P["Vpm"]
msum, mprod = m10+m12+m21, m10*m21
malpha = (msum + np.sqrt(msum**2-4*mprod))/2; mbeta = (msum - np.sqrt(msum**2-4*mprod))/2
out["rates"] = dict(k10=k10, k12=k12, k21=k21, alpha=alpha, beta=beta, t_alpha=np.log(2)/alpha, t_beta=np.log(2)/beta,
                    m10=m10, m12=m12, m21=m21, malpha=malpha, mbeta=mbeta, t_malpha=np.log(2)/malpha, t_mbeta=np.log(2)/mbeta,
                    t_ka=np.log(2)/P["ka"])
out["F_REL"], out["S_OH"], out["fit_rmse_log"], out["W"] = F_REL, S_OH, fit_rmse, W

# ---------------- version 2: regular / heavy users ----------------
# (a) Reissig 2026 (J Clin Psychopharmacol 46:386): single doses 1-12 g leaf capsules (~1 % MG), fed, 48 h sampling,
#     opioid-experienced non-dependent adults. Means (CV) from Table 4; MG mg = midpoint of the reported range.
R_G = [1, 3, 8, 10, 12]
R_MG = [10.25, 30.85, 82.25, 102.8, 123.35]
R_OBS = dict(mg_cmax=[41.7, 118, 197.5, 318.1, 378.5], mg_auc48=[305.4, 784.8, 1942, 3254, 3271], mg_thalf=[17.28, 18.64, 17.47, 22.07, 15.9],
             oh_cmax=[6.7, 17.8, 34.0, 48.4, 58.4], oh_auc48=[53.5, 132.9, 412.6, 459.1, 574.3])
T48 = np.arange(0, 48.0001, 0.01)
reissig = []
for mg in R_MG:
    cm, co = simulate([(0, mg)], T48, F=F_REL, s=S_OH)
    reissig.append(dict(mg_cmax=cm.max(), mg_auc48=np.trapezoid(cm, T48), oh_cmax=co.max(), oh_auc48=np.trapezoid(co, T48)))
out["reissig"] = reissig
out["reissig_ratio"] = {k: [R_OBS[k][i]/reissig[i][k] for i in range(5)] for k in ["mg_cmax", "mg_auc48", "oh_cmax", "oh_auc48"]}
out["reissig_auc_per_mg"] = [R_OBS["mg_auc48"][i]/R_MG[i] for i in range(5)]
gm = lambda xs: float(np.exp(np.mean(np.log(xs))))
out["reissig_gm_ratio"] = {k: gm(v) for k, v in out["reissig_ratio"].items()}

# (b) Trakulsrichai 2015: 7 days of a fixed daily tea dose in regular users, then a test dose on day 8; observed Cmax 18.5-105 ng/mL.
TRAK = [(6.25, 12.5), (6.25, 6.25), (9.96, 19.92), (9.96, 9.96), (11.5, 23.0)]
t8 = np.arange(0, 24*8, 0.01)
out["trak"] = []
for daily, load in TRAK:
    cm, _ = simulate([(24*k, daily) for k in range(7)] + [(24*7, load)], t8, F=F_REL, s=S_OH)
    cmt, _ = simulate([(24*k, daily) for k in range(7)] + [(24*7, load)], t8, F=1.0, s=S_OH)   # tea-like absorption (Mongar fit)
    w = t8 >= 24*7
    out["trak"].append(dict(daily=daily, load=load, cmax=cm[w].max(), cmax_tea=cmt[w].max()))

# (c) Smith 2024 (regular users, 6.6 y of use): typical morning dose 0.77 mg/kg MG (~54 mg at 70 kg) after overnight abstinence;
#     post-dose plasma MG 176 (37-396) ng/mL, 7-OH 34 (3-78) ng/mL. Daily frequency unknown -> 3, 4 and 6 equal doses/day,
#     last evening dose ~8 h before (doses at 08:00 + i*0.75*24/n), metric = max within 3 h after the morning dose.
out["smith"] = []
t40 = np.arange(0, 24*40 + 12, 0.05)
for n in (3, 4, 6):
    step = 24/n
    cm, co = simulate([(24*d + 8 + i*step*0.75, 54.0) for d in range(40) for i in range(n)], t40, F=F_REL, s=S_OH)
    w = (t40 > 24*39 + 8) & (t40 < 24*39 + 11.2)
    out["smith"].append(dict(n=n, mg=cm[w].max(), oh=co[w].max(), ratio=co[w].max()/cm[w].max()))

# (d) Kanumuri 2026 (regular users): pre-dose concentration C0 before the usual dose (mg MG), daily amounts not reported.
KAN = [("KIDN01", 32.3, 26.9), ("KIJC02", 26.6, 58.5), ("KIDL03", 54.1, 222.4), ("KIDM04", 29.8, 107.7)]
out["kanumuri"] = []
for name, mg, c0 in KAN:
    row = dict(name=name, mg=mg, c0=c0)
    for n in (3, 4, 6):
        step = 24/n
        cm, _ = simulate([(24*d + 8 + i*step*0.75, mg) for d in range(40) for i in range(n)], t40, F=F_REL, s=S_OH)
        row[f"x{n}"] = cm[np.searchsorted(t40, 24*39 + 8 - 0.01)]
    out["kanumuri"].append(row)

# (e) Uncertainty of the decline: the same model with all disposition clearances (CL, Q, CLm, Qm) multiplied by s.
#     This scales every disposition rate constant (not absorption) by s, so the terminal half-life becomes t_beta/s.
#     Targets: 20 h (fast end: Trakulsrichai, Kanumuri, Reissig) and 60 h (slow end: Huestis 2024 after 15 daily doses,
#     10-day sampling); for heavy users (14-day mean above the highest amount with human data, 12 g/day) the slow end is
#     extended by the largest supra-proportional exposure reported (x1.4, Huestis 2024/2026): 84 h.
HEAVY_G_PER_DAY = 12.0
T_FAST, T_SLOW = 20.0, 60.0
T_SLOW_HEAVY = T_SLOW*1.4
def p_scaled(s):
    q = dict(P)
    for k in ("CL", "Q", "CLm", "Qm"): q[k] = P[k]*s
    return q
def closed_form(p):
    """(lambda_k ascending, combined-index coefficients c_k in nM per gram) for parameter set p."""
    Ak = A_matrix(p); lm, Vv = np.linalg.eig(Ak); cc = np.linalg.solve(Vv, np.array([1000.0, 0, 0, 0, 0]))
    lm = -np.real(lm); cMG = np.real(Vv[1]*cc)/p["Vc"]; cOH = np.real(Vv[3]*cc)/p["Vcm"]
    o = np.argsort(lm)
    cE = F_REL*mg_per_g*(cMG*1000/MW_MG + W*S_OH*cOH*1000/MW_OH)
    return [float(x) for x in lm[o]], [float(x) for x in cE[o]]
lam_beta = -min(np.real(np.linalg.eigvals(A_matrix(P))), key=abs)   # smallest rate = MG terminal phase
variants = {}
for name, th in [("fast", T_FAST), ("slow", T_SLOW), ("slowHeavy", T_SLOW_HEAVY)]:
    s = (np.log(2)/th)/lam_beta
    lm, cE = closed_form(p_scaled(s))
    variants[name] = dict(scale=s, t_half_terminal=th, lambda_per_h=lm, level_nM_per_g=cE)
out["variants"] = variants
out["t_beta_central"] = float(np.log(2)/lam_beta)
def E_curve(lm, cE, doses, t):
    y = np.zeros_like(t)
    for td, g in doses:
        tau = t - td; m = tau >= 0
        y[m] += g*np.sum(np.array(cE)[:, None]*np.exp(-np.outer(np.array(lm), tau[m])), axis=0)
    return y
# washout after 30 days on 6 g/day (= baseline) in three doses: hours from the last dose until the level is below 50/25/10 %
# of the baseline level. Each variant is expressed against its OWN steady-state reference R (as the app does), so all
# variants agree on a steady routine and differ only in how fast the level moves when intake changes.
def R_of(lm, cE): return float(sum(c/l for c, l in zip(cE, lm))/24)
for v in variants.values(): v["R_daily_mean_nM_per_g_per_day"] = R_of(v["lambda_per_h"], v["level_nM_per_g"])
wd = [(24*d + h, 6*f) for d in range(30) for h, f in [(8, .4), (14, .35), (20.5, .25)]]
t_last = 24*29 + 20.5
tw = np.arange(t_last, t_last + 24*21, 0.05)
lam_c, cE_c = out["coef"]["lam"], out["coef"]["coefE"]
wcurves = {"central": E_curve(lam_c, cE_c, wd, tw)/(R_PER_G*6)*100}
for name, v in variants.items():
    wcurves[name] = E_curve(v["lambda_per_h"], v["level_nM_per_g"], wd, tw)/(v["R_daily_mean_nM_per_g_per_day"]*6)*100
out["washout_band"] = {}
for name, y in wcurves.items():
    peak_i = int(np.argmax(y)); row = {}
    for pct in (50, 25, 10):
        below = np.nonzero((np.arange(len(y)) > peak_i) & (y < pct))[0]
        row[pct] = float(tw[below[0]] - t_last) if len(below) else None
    out["washout_band"][name] = row
# memory window check for the slowest variant: share of a dose's peak left after 14 days
v = variants["slowHeavy"]; t1 = np.arange(0, 24*14 + 0.001, 0.01); e1 = E_curve(v["lambda_per_h"], v["level_nM_per_g"], [(0, 1)], t1)
out["slowHeavy_tail14_pct"] = float(100*e1[-1]/e1.max())

# ---------------- figures ----------------
def save(fig, name): fig.tight_layout(); fig.savefig(os.path.join(FIG, name)); plt.close(fig)

# Fig 1: single 1 g dose, absolute (log) and relative
t = np.linspace(0, 72, 7201); a, b = simulate([(0, mg_per_g)], t, F=F_REL, s=S_OH); e = E_from(a, b)
fig, ax = plt.subplots(1, 2, figsize=(6.6, 2.6))
ax[0].plot(t, a, color=C_MG, label="mitragynine"); ax[0].plot(t, b, color=C_OH, label="7-OH-mitragynine")
ax[0].set_yscale("log"); ax[0].set_ylim(0.01, 30); ax[0].set_xlabel("time after dose (h)"); ax[0].set_ylabel("plasma conc. (ng/mL)")
ax[0].set_xticks([0, 12, 24, 36, 48, 60, 72]); ax[0].legend(); ax[0].set_title("(a) 1 g powder (16 mg MG), log scale", fontsize=9)
ax[1].plot(t, 100*a/a.max(), color=C_MG, lw=1, label="MG"); ax[1].plot(t, 100*b/b.max(), color=C_OH, lw=1, label="7-OH")
ax[1].plot(t, 100*e/e.max(), color=C_E, lw=2, label="combined index $E$")
ax[1].set_xlim(0, 24); ax[1].set_xticks([0, 4, 8, 12, 16, 20, 24]); ax[1].set_xlabel("time after dose (h)"); ax[1].set_ylabel("% of own peak")
ax[1].legend(); ax[1].set_title("(b) normalised shape, first 24 h", fontsize=9)
save(fig, "single_dose.pdf")

# Fig 2: calibration and validation vs Huestis
fig, ax = plt.subplots(1, 2, figsize=(6.6, 2.7))
for key, col, mk, lbl in [("mg_cmax", C_MG, "o", "MG $C_{max}$"), ("mg_auc", C_MG, "s", "MG AUC"),
                          ("oh_cmax", C_OH, "o", "7-OH $C_{max}$"), ("oh_auc", C_OH, "s", "7-OH AUC")]:
    obs = H_SD[key]; pred = [r[key] for r in out["sd"]]
    ax[0].scatter(obs, pred, color=col, marker=mk, s=18, label=lbl, facecolors="none" if mk == "s" else col)
    obs = H_MD[key]; pred = [r[key] for r in out["md"]]
    ax[1].scatter(obs, pred, color=col, marker=mk, s=18, label=lbl.replace("AUC", "AUC$_\\tau$"), facecolors="none" if mk == "s" else col)
for k in ["mg_tr", "oh_tr"]:
    obs = np.array(H_MD[k]); pred = np.array([r[k] for r in out["md"]]); m = obs > 0
    ax[1].scatter(obs[m], pred[m], color=C_MG if k == "mg_tr" else C_OH, marker="^", s=18, label=("MG" if k == "mg_tr" else "7-OH")+" trough")
for i, ttl in enumerate(["(a) single dose (calibration)", "(b) day 15 of daily dosing (validation)"]):
    ax[i].set_xscale("log"); ax[i].set_yscale("log"); lim = (0.3, 2000)
    ax[i].plot(lim, lim, color=C_GREY, lw=0.8); ax[i].plot(lim, [l*2 for l in lim], color=C_GREY, lw=0.5, ls=":")
    ax[i].plot(lim, [l/2 for l in lim], color=C_GREY, lw=0.5, ls=":")
    ax[i].set_xlim(lim); ax[i].set_ylim(lim); ax[i].set_xlabel("observed (Huestis 2024)"); ax[i].set_ylabel("model")
    ax[i].set_title(ttl, fontsize=9); ax[i].legend(fontsize=6.5, loc="upper left")
save(fig, "calibration.pdf")

# Fig 3: realistic taper scenario + "Dnes" view
rng = np.random.default_rng(1)
days = 42; base = 6.0
doses = []
for dday in range(days):
    lim_g = base if dday < 14 else base*(1 - 0.5*(dday-14)/(days-14))
    times = [8 + rng.normal(0, 0.5), 14 + rng.normal(0, 0.7), 20.5 + rng.normal(0, 0.7)]
    split = [0.4, 0.35, 0.25]
    for tm, f in zip(times, split): doses.append((24*dday + tm, lim_g*f))
tg = np.arange(0, 24*days + 0.001, 0.05)
a, b = simulate([(td, g*mg_per_g) for td, g in doses], tg, F=F_REL, s=S_OH)
rel = E_from(a, b)/(R_PER_G*base)*100
fig, ax = plt.subplots(2, 1, figsize=(6.6, 4.2), gridspec_kw=dict(height_ratios=[1.2, 1]))
ax[0].plot(tg/24, rel, color=C_E, lw=0.7)
daily = [np.trapezoid(rel[(tg >= 24*k) & (tg < 24*(k+1))], tg[(tg >= 24*k) & (tg < 24*(k+1))])/24 for k in range(days)]
ax[0].step(np.arange(days)+0.5, daily, where="mid", color=C_OH, lw=1.2, label="daily mean")
ax[0].axvline(14, color=C_GREY, lw=0.6, ls="--"); ax[0].text(14.3, 170, "taper starts", fontsize=7, color=C_GREY)
ax[0].set_xlabel("day"); ax[0].set_ylabel("relative level (% of reference)"); ax[0].legend(loc="upper right")
ax[0].set_title("(a) 6 g/day in 3 doses for 2 weeks, then linear taper to 3 g/day", fontsize=9); ax[0].set_ylim(0, 190); ax[0].axhline(100, color=C_GREY, lw=0.5, ls=":")
now = 24*30 + 16.0; win = (tg >= now-24) & (tg <= now+12)
past = win & (tg <= now); fut = win & (tg >= now)
a2, b2 = simulate([(td, g*mg_per_g) for td, g in doses if td <= now], tg, F=F_REL, s=S_OH)
rel2 = E_from(a2, b2)/(R_PER_G*base)*100
ax[1].fill_between((tg[past]-now), rel[past], color=C_E, alpha=0.12, lw=0); ax[1].plot(tg[past]-now, rel[past], color=C_E, lw=1.6)
ax[1].plot(tg[fut]-now, rel2[fut], color=C_E, lw=1.2, ls="--")
for td, g in doses:
    if now-24 <= td <= now: ax[1].plot([td-now], [2], marker="v", color=C_OH, ms=5)
ax[1].axvline(0, color=C_GREY, lw=0.8); ax[1].text(0.4, rel[np.argmin(abs(tg-now))]*1.02, "now %.0f %%" % rel[np.argmin(abs(tg-now))], fontsize=7)
ax[1].set_xlabel("hours relative to now"); ax[1].set_ylabel("relative level (%)")
ax[1].set_title("(b) proposed Today card (day 30, 16:00)", fontsize=9)
ax[1].set_xticks(range(-24, 13, 4)); ax[1].set_ylim(0, None)
save(fig, "taper.pdf")

# Fig 4: sensitivity -- (a) potency weight W, (b) parameter uncertainty (posterior, lognormal approx.)
t = np.linspace(0, 48, 4801)
fig, ax = plt.subplots(1, 2, figsize=(6.6, 2.6))
for w, ls in [(0, ":"), (5, "-."), (W, "-"), (20, "--")]:
    a, b = simulate([(0, mg_per_g)], t, F=F_REL, s=S_OH); e = a*1000/MW_MG + w*b*1000/MW_OH
    ax[0].plot(t, 100*e/e.max(), color=C_E, ls=ls, lw=1.2, label=f"w = {w:.1f}" + (" (used)" if w == W else (" (MG only)" if w == 0 else "")))
ax[0].set_xlabel("time after dose (h)"); ax[0].set_ylabel("% of peak"); ax[0].legend(); ax[0].set_title("(a) weight of 7-OH in $E$", fontsize=9)
ax[0].set_xticks(range(0, 49, 8))
rng = np.random.default_rng(7); curves = []
for _ in range(400):
    q = {k: P[k]*np.exp(rng.normal(0, np.sqrt(np.log(1+(P_SD[k]/P_MEAN[k])**2)))) for k in P}
    q["Fm"] = min(q["Fm"], 0.99)
    a, b = impulse(q, t); e = a*1000/MW_MG + W*S_OH*b*1000/MW_OH; curves.append(100*e/e.max())
curves = np.array(curves); lo, med, hi = np.percentile(curves, [5, 50, 95], axis=0)
ax[1].fill_between(t, lo, hi, color=C_E, alpha=0.15, lw=0, label="90 % interval"); ax[1].plot(t, med, color=C_E, lw=1.4, label="median")
ax[1].set_xlabel("time after dose (h)"); ax[1].set_ylabel("% of peak"); ax[1].legend(); ax[1].set_xticks(range(0, 49, 8))
ax[1].set_title("(b) parameter uncertainty (Notario posterior)", fontsize=9)
save(fig, "sensitivity.pdf")
out["unc_12h"] = [float(lo[1200]), float(med[1200]), float(hi[1200])]
out["unc_24h"] = [float(lo[2400]), float(med[2400]), float(hi[2400])]

# Fig 5: dose and timing responsiveness
t = np.linspace(0, 36, 3601)
fig, ax = plt.subplots(1, 2, figsize=(6.6, 2.5))
for g, ls in [(1, ":"), (2, "-."), (4, "-")]:
    a, b = simulate([(0, g*mg_per_g)], t, F=F_REL, s=S_OH); ax[0].plot(t, E_from(a, b)/R_PER_G/4*100, color=C_E, ls=ls, label=f"{g} g")
ax[0].set_title("(a) single doses (linear in dose)", fontsize=9); ax[0].legend(); ax[0].set_xlabel("time (h)"); ax[0].set_ylabel("$L$ (%), baseline 4 g/day")
for sched, col, lbl in [([(0, 4)], C_E, "4 g at once"), ([(0, 2), (6, 2)], C_MG, "2 g + 2 g (6 h)"), ([(0, 1), (4, 1), (8, 1), (12, 1)], C_OH, "4 x 1 g (4 h)")]:
    a, b = simulate([(td, g*mg_per_g) for td, g in sched], t, F=F_REL, s=S_OH); ax[1].plot(t, E_from(a, b)/R_PER_G/4*100, color=col, label=lbl)
ax[1].set_title("(b) same 4 g, different timing", fontsize=9); ax[1].legend(); ax[1].set_xlabel("time (h)")
for x in ax: x.set_xticks(range(0, 37, 6))
save(fig, "dose_timing.pdf")


# Fig 6: (a) Reissig 2026 high single doses: exposure per mg MG is flat from 1 to 12 g (linear), observed vs model;
#        (b) washout band: stopping after 30 days of 6 g/day (baseline), each variant against its own reference.
fig, ax = plt.subplots(1, 2, figsize=(6.6, 2.7))
ax[0].plot(R_G, [R_OBS["mg_auc48"][i]/R_MG[i] for i in range(5)], "o-", color=C_MG, ms=4, label="observed MG AUC$_{0-48}$/mg")
ax[0].plot(R_G, [reissig[i]["mg_auc48"]/R_MG[i] for i in range(5)], "s--", color=C_MG, ms=4, mfc="none", label="model (capsule $F_{rel}$)")
ax[0].plot(R_G, [R_OBS["oh_auc48"][i]/R_MG[i] for i in range(5)], "o-", color=C_OH, ms=4, label="observed 7-OH")
ax[0].plot(R_G, [reissig[i]["oh_auc48"]/R_MG[i] for i in range(5)], "s--", color=C_OH, ms=4, mfc="none", label="model 7-OH")
ax[0].set_xlabel("single dose (g leaf powder)"); ax[0].set_ylabel("AUC$_{0-48}$ per mg MG (ng h/mL/mg)")
ax[0].set_ylim(0, 52); ax[0].set_xticks(R_G); ax[0].legend(fontsize=6, ncol=2, loc="upper center"); ax[0].set_title("(a) high doses stay linear (Reissig 2026)", fontsize=9)
th = (tw - t_last)/24
lab = {"central": "central (38.5 h)", "fast": "fast end (20 h)", "slow": "slow end (60 h)", "slowHeavy": "slow end, heavy users (84 h)"}
sty = {"central": ("-", C_E, 1.6), "fast": (":", C_E, 1.1), "slow": ("--", C_E, 1.1), "slowHeavy": ("-.", C_OH, 1.1)}
for name in ["fast", "central", "slow", "slowHeavy"]:
    ls, col, lw = sty[name]; ax[1].plot(th, wcurves[name], ls=ls, color=col, lw=lw, label=lab[name])
ax[1].fill_between(th, wcurves["fast"], wcurves["slow"], color=C_E, alpha=0.10, lw=0)
for y in (50, 25, 10): ax[1].axhline(y, color=C_GREY, lw=0.4, ls=":")
ax[1].set_xlim(0, 10); ax[1].set_ylim(0, 160); ax[1].set_xlabel("days after the last dose"); ax[1].set_ylabel("$L$ (%), baseline 6 g/day")
ax[1].legend(fontsize=6.5); ax[1].set_title("(b) range shown for the decline", fontsize=9)
save(fig, "heavy_users.pdf")

# ---------- numbers for LaTeX ----------
def f(x, n=2): return f"{x:.{n}f}"
def fz(x, n): return "0" if abs(x) < 10**-n else f"{x:+.{n}f}"
r = out["rates"]
L = {}
L["Frel"] = f(F_REL, 3); L["Soh"] = f(S_OH, 2); L["fitrmse"] = f(fit_rmse, 3); L["W"] = f(W, 2)
for k in ["alpha", "beta", "malpha", "mbeta", "k10", "k12", "k21", "m10", "m12", "m21"]: L[k] = f(r[k], 4)
for k in ["t_alpha", "t_beta", "t_malpha", "t_mbeta", "t_ka"]: L[k.replace("_", "")] = f(r[k], 2)
L["teaMGcmax"] = f(out["tea"]["mg_cmax"], 1); L["teaMGtmax"] = f(out["tea"]["mg_tmax"], 2); L["teaMGauc"] = f(out["tea"]["mg_auc"], 0)
L["teaOHcmax"] = f(out["tea"]["oh_cmax"], 1); L["teaOHtmax"] = f(out["tea"]["oh_tmax"], 2); L["teaOHauc"] = f(out["tea"]["oh_auc"], 0)
L["Rperg"] = f(R_PER_G, 2); L["Epeakperg"] = f(out["E_single_peak_per_g"], 2); L["Etmax"] = f(out["E_single_tmax"], 2); L["accum"] = f(out["accum_peak"], 3); L["Rpeakperg"] = f(R_PEAK, 2); L["singlepeakrel"] = f(100*out["single_peak_rel"], 0); L["sspeakrel"] = f(100*out["ss_peak_rel"], 0)
L["shareOHauc"] = f(100*out["share_OH_auc"], 0); L["shareOHpeak"] = f(100*out["share_OH_peak"], 0); L["directOH"] = f(100*out["direct_OH_upper"], 2)
for h, v in out["shape_E"].items(): L[f"shapeE{h}"] = f(v, 0)
for h, v in out["shape_MG"].items(): L[f"shapeMG{h}"] = f(v, 0)
for h, v in out["shape_OH"].items(): L[f"shapeOH{h}"] = f(v, 0)
for d, v in out["washout"].items(): L[f"wash{d}"] = f(v, 1) if v >= 0.05 else "<0.1"
for d in [7, 10, 14]: L[f"tail{d}"] = f(out[f"tail_{d}d_pct"], 2)
L["unclo12"], L["uncmed12"], L["unchi12"] = (f(x, 0) for x in out["unc_12h"])
L["unclo24"], L["uncmed24"], L["unchi24"] = (f(x, 0) for x in out["unc_24h"])
roman = dict(zip("0123456789", ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]))
def mac(name): return "".join(roman.get(ch, ch) for ch in name)
with open(os.path.join(HERE, "numbers.tex"), "w") as fh:
    for k, v in L.items(): fh.write(f"\\newcommand{{\\n{mac(k)}}}{{{v}}}\n")
    # tables
    rows = []
    for i, d in enumerate(H_D):
        s_, m_ = out["sd"][i], out["md"][i]
        rows.append(f"{d:g} & {H_SD['mg_cmax'][i]:g} & {s_['mg_cmax']:.1f} & {H_SD['mg_auc'][i]:g} & {s_['mg_auc']:.0f} & {H_SD['oh_cmax'][i]:g} & {s_['oh_cmax']:.1f} & {H_SD['oh_auc'][i]:g} & {s_['oh_auc']:.0f} \\\\")
    fh.write("\\newcommand{\\tabSD}{" + "\n".join(rows) + "}\n")
    rows = []
    for i, d in enumerate(H_D):
        m_ = out["md"][i]
        rows.append(f"{d:g} & {H_MD['mg_cmax'][i]:g} & {m_['mg_cmax']:.1f} & {H_MD['mg_tr'][i]:g} & {m_['mg_tr']:.2f} & {H_MD['mg_auc'][i]:g} & {m_['mg_auc']:.0f} & {H_MD['oh_cmax'][i]:g} & {m_['oh_cmax']:.1f} & {H_MD['oh_auc'][i]:g} & {m_['oh_auc']:.0f} \\\\")
    fh.write("\\newcommand{\\tabMD}{" + "\n".join(rows) + "}\n")
    rows = []
    for k in range(5):
        rows.append(f"{k+1} & {out['coef']['lam'][k]:.6f} & {np.log(2)/out['coef']['lam'][k]:.2f} & {fz(out['coef']['coefMG'][k], 6)} & {fz(out['coef']['coefOH'][k], 6)} & {fz(out['coef']['coefE'][k], 5)} \\\\")
    fh.write("\\newcommand{\\tabCoef}{" + "\n".join(rows) + "}\n")
with open(os.path.join(HERE, "ts_constants.json"), "w") as fh:
    json.dump(dict(lambda_per_h=out["coef"]["lam"], level_nM_per_g=out["coef"]["coefE"], R_daily_mean_nM_per_g_per_day=R_PER_G,
                   mg_MG_per_g=out["coef"]["amtMG"], mg_OH_per_g=out["coef"]["amtOH"],
                   heavy_g_per_day=HEAVY_G_PER_DAY,
                   variants={k: dict(t_half_terminal_h=v_["t_half_terminal"], lambda_per_h=v_["lambda_per_h"], level_nM_per_g=v_["level_nM_per_g"],
                                     R_daily_mean_nM_per_g_per_day=v_["R_daily_mean_nM_per_g_per_day"]) for k, v_ in variants.items()}), fh, indent=1)
Tex = np.arange(0, 14*24 + 0.001, 0.05)
def amt_series(doses, t, coef):
    y = np.zeros_like(t)
    for td, g in doses:
        tau = t - td; m = tau >= 0
        y[m] += g*np.sum(np.array(coef)[:, None]*np.exp(-np.outer(np.array(out["coef"]["lam"]), tau[m])), axis=0)
    return y
ex = [(24*d + h, 6*f) for d in range(14) for h, f in [(8, .4), (14, .35), (20.5, .25)]]
w14 = Tex >= 13*24
aMG = amt_series(ex, Tex, out["coef"]["amtMG"])[w14]; aOH = amt_series(ex, Tex, out["coef"]["amtOH"])[w14]
with open(os.path.join(HERE, "numbers.tex"), "a") as fh:
    fh.write(f"\\newcommand{{\\nexMGlo}}{{{aMG.min():.0f}}}\\newcommand{{\\nexMGhi}}{{{aMG.max():.0f}}}"
             f"\\newcommand{{\\nexOHlo}}{{{aOH.min():.1f}}}\\newcommand{{\\nexOHhi}}{{{aOH.max():.1f}}}\n")
    fh.write("\\newcommand{\\tabAmt}{" + "\n".join(f"{k+1} & {out["coef"]["lam"][k]:.6f} & {fz(out['coef']['amtMG'][k], 5)} & {fz(out['coef']['amtOH'][k], 5)} \\\\" for k in range(5)) + "}\n")

# ---------- version 2 numbers ----------
def hrs(x): return "--" if x is None else (f"{x:.0f}\\,h" if x < 48 else f"{x/24:.1f}\\,d")
with open(os.path.join(HERE, "numbers.tex"), "a") as fh:
    V2 = {"tbetac": f(out["t_beta_central"], 1), "heavyg": f"{HEAVY_G_PER_DAY:g}", "tfast": f"{T_FAST:g}", "tslow": f"{T_SLOW:g}",
          "tslowheavy": f"{T_SLOW_HEAVY:g}", "sfast": f(variants["fast"]["scale"], 2), "sslow": f(variants["slow"]["scale"], 2),
          "sslowheavy": f(variants["slowHeavy"]["scale"], 2), "tailheavy": f(out["slowHeavy_tail14_pct"], 2),
          "rgmcmax": f(out["reissig_gm_ratio"]["mg_cmax"], 2), "rgmauc": f(out["reissig_gm_ratio"]["mg_auc48"], 2),
          "rgmohcmax": f(out["reissig_gm_ratio"]["oh_cmax"], 2), "rgmohauc": f(out["reissig_gm_ratio"]["oh_auc48"], 2),
          "raucmin": f(min(out["reissig_auc_per_mg"]), 1), "raucmax": f(max(out["reissig_auc_per_mg"]), 1)}
    for k, v_ in V2.items(): fh.write(f"\\newcommand{{\\n{mac(k)}}}{{{v_}}}\n")
    rows = [f"{R_G[i]} & {R_MG[i]:.0f} & {R_OBS['mg_cmax'][i]:g} & {reissig[i]['mg_cmax']:.0f} & {R_OBS['mg_auc48'][i]:g} & {reissig[i]['mg_auc48']:.0f} & "
            f"{R_OBS['oh_cmax'][i]:g} & {reissig[i]['oh_cmax']:.1f} & {R_OBS['oh_auc48'][i]:g} & {reissig[i]['oh_auc48']:.0f} & {R_OBS['mg_auc48'][i]/reissig[i]['mg_auc48']:.2f} \\\\"
            for i in range(5)]
    fh.write("\\newcommand{\\tabReissig}{" + "\n".join(rows) + "}\n")
    rows = [f"{r['daily']:g} & {r['load']:g} & {r['cmax']:.0f} & {r['cmax_tea']:.0f} \\\\" for r in out["trak"]]
    fh.write("\\newcommand{\\tabTrak}{" + "\n".join(rows) + "}\n")
    rows = [f"{r['n']} & {r['mg']:.0f} & {r['oh']:.0f} & {r['ratio']:.2f} \\\\" for r in out["smith"]]
    fh.write("\\newcommand{\\tabSmith}{" + "\n".join(rows) + "}\n")
    rows = [f"{r['name']} & {r['mg']:g} & {r['c0']:g} & {r['x3']:.0f} & {r['x4']:.0f} & {r['x6']:.0f} \\\\" for r in out["kanumuri"]]
    fh.write("\\newcommand{\\tabKan}{" + "\n".join(rows) + "}\n")
    nm = {"fast": "fast end", "central": "central", "slow": "slow end", "slowHeavy": "slow end, heavy users"}
    th_ = {"fast": T_FAST, "central": out["t_beta_central"], "slow": T_SLOW, "slowHeavy": T_SLOW_HEAVY}
    rows = [f"{nm[k]} & {th_[k]:.0f} & {hrs(out['washout_band'][k][50])} & {hrs(out['washout_band'][k][25])} & {hrs(out['washout_band'][k][10])} \\\\"
            for k in ["fast", "central", "slow", "slowHeavy"]]
    fh.write("\\newcommand{\\tabWash}{" + "\n".join(rows) + "}\n")

with open(os.path.join(HERE, "numbers.json"), "w") as fh:
    json.dump(out, fh, indent=1, default=float)
print(json.dumps({k: out[k] for k in ["F_REL", "S_OH", "fit_rmse_log", "W", "tea", "rates", "R_per_g_nM", "E_single_peak_per_g",
      "accum_peak", "share_OH_auc", "share_OH_peak", "direct_OH_upper", "shape_E", "washout", "tail_7d_pct", "tail_14d_pct", "unc_12h", "unc_24h", "coef"]}, indent=1, default=float))
for i in range(4): print(H_D[i], {k: round(v, 2) for k, v in out["md"][i].items()})
