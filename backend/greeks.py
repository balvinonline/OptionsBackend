import math
from scipy.stats import norm

# Risk-free interest rate (e.g. 7% for India)
RISK_FREE_RATE = 0.07

def calculate_d1_d2(S, K, T, r, sigma):
    """
    Calculate d1 and d2 for Black-Scholes.
    S: Spot Price
    K: Strike Price
    T: Time to maturity (in years)
    r: Risk-free rate
    sigma: Volatility (annualized)
    """
    if T <= 0 or sigma <= 0 or K <= 0 or S <= 0:
        return 0, 0
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return d1, d2

def black_scholes_price(S, K, T, r, sigma, option_type='CE'):
    if T <= 0:
        return max(0.0, S - K) if option_type == 'CE' else max(0.0, K - S)
    if sigma <= 0:
        return max(0.0, S - K) if option_type == 'CE' else max(0.0, K - S)
    
    d1, d2 = calculate_d1_d2(S, K, T, r, sigma)
    
    if option_type == 'CE':
        price = S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
    else:
        price = K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    return price

def calculate_greeks(S, K, T, r, sigma, option_type='CE'):
    """
    Returns Delta, Theta, and Gamma.
    Theta is returned as decay per day.
    """
    if T <= 0 or sigma <= 0:
        return {"delta": 0, "theta": 0, "gamma": 0}
        
    d1, d2 = calculate_d1_d2(S, K, T, r, sigma)
    
    # Delta
    if option_type == 'CE':
        delta = norm.cdf(d1)
    else:
        delta = norm.cdf(d1) - 1.0
        
    # Gamma (same for CE and PE)
    gamma = norm.pdf(d1) / (S * sigma * math.sqrt(T))
    
    # Theta (per year)
    theta_term1 = -(S * norm.pdf(d1) * sigma) / (2 * math.sqrt(T))
    if option_type == 'CE':
        theta_yr = theta_term1 - r * K * math.exp(-r * T) * norm.cdf(d2)
    else:
        theta_yr = theta_term1 + r * K * math.exp(-r * T) * norm.cdf(-d2)
        
    # Theta per day (divided by 365)
    theta_day = theta_yr / 365.0
    
    return {
        "delta": round(delta, 4),
        "theta": round(theta_day, 4),
        "gamma": round(gamma, 6)
    }

def implied_volatility(target_price, S, K, T, r, option_type='CE', max_iterations=100, precision=1.0e-5):
    """
    Calculate IV using Newton-Raphson.
    """
    if target_price <= 0 or T <= 0 or S <= 0 or K <= 0:
        return 0.0001
        
    # Initial guess
    sigma = 0.3
    
    for i in range(max_iterations):
        price = black_scholes_price(S, K, T, r, sigma, option_type)
        diff = price - target_price
        
        if abs(diff) < precision:
            return sigma
            
        d1, _ = calculate_d1_d2(S, K, T, r, sigma)
        vega = S * norm.pdf(d1) * math.sqrt(T)
        
        # Avoid division by zero
        if vega < 1e-8:
            break
            
        sigma = sigma - diff / vega
        
        # Keep sigma bounded between 1% and 300%
        sigma = max(0.01, min(sigma, 3.0))
        
    return sigma
