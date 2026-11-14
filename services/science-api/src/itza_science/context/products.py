"""Collection versions explicitly supported by the native context decoders."""

NISAR = "NISAR_L3_SME2_PROVISIONAL_V1"
GRACE = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"
PRODUCTS = {
    NISAR: ("1", 200),
    GRACE: ("RL06.3Mv04", 300000),
    "GEDI02_A": ("002", 25),
    "GEDI02_B": ("002", 25),
    "ECO_L2T_LSTE": ("002", 70),
    "ECO_L4T_ESI": ("002", 70),
    "SPL4SMGP": ("008", 9000),
}
