# Mechanics Of Particles — Short Notes

> **Unit 1 · Section 1** | UPSC Physics Optional

---

## 1. Newton's Laws of Motion

Newton's three laws form the foundation of classical mechanics:

1. A body remains at rest or in uniform motion unless acted upon by a net external force.
2. The rate of change of momentum equals the net external force:
$$\vec{F} = \frac{d\vec{p}}{dt} = m\vec{a}$$
3. Every action has an equal and opposite reaction.

---

## 2. Conservation Laws

### Linear Momentum
For an isolated system, total momentum is conserved:
$$\vec{p}_{\text{total}} = \sum_i m_i \vec{v}_i = \text{const}$$

### Angular Momentum
$$\vec{L} = \vec{r} \times \vec{p}, \qquad \frac{d\vec{L}}{dt} = \vec{\tau}$$

For a central force $\vec{F} \parallel \vec{r}$, the torque $\vec{\tau} = 0$, so $\vec{L}$ is conserved.

---

## 3. Motion Under a Central Force

The equation of orbit (Binet's equation):
$$\frac{d^2u}{d\theta^2} + u = -\frac{m}{l^2 u^2} f\!\left(\frac{1}{u}\right)$$
where $u = 1/r$ and $l = mr^2\dot{\theta}$ is the angular momentum per unit mass.

### Kepler's Laws
1. Planets move in ellipses with the Sun at one focus.
2. The radius vector sweeps equal areas in equal times: $\frac{dA}{dt} = \frac{l}{2} = \text{const}$
3. $T^2 \propto a^3$, where $a$ is the semi-major axis.

---

## 4. Gravitational Field and Potential

| Quantity | Expression |
|---|---|
| Gravitational field | $\vec{g} = -\nabla\phi$ |
| Potential outside sphere | $\phi = -\dfrac{GM}{r}$ |
| Gauss's law (gravity) | $\oint \vec{g}\cdot d\vec{A} = -4\pi G M_{\text{enc}}$ |
| Poisson's equation | $\nabla^2\phi = 4\pi G\rho$ |
| Laplace's equation (vacuum) | $\nabla^2\phi = 0$ |

---

## 5. Galilean Transformations

For frame $S'$ moving at velocity $V$ along $x$:
$$x' = x - Vt, \quad y' = y, \quad z' = z, \quad t' = t$$

Velocity addition: $v'_x = v_x - V$

> [!NOTE]
> Galilean transformations break down at relativistic speeds. See Unit 1 · S4 for Lorentz transformations.

---

## 6. Non-Inertial Frames

In a rotating frame with angular velocity $\vec{\omega}$, the effective equation of motion is:
$$m\vec{a}_{\text{rot}} = \vec{F} - 2m(\vec{\omega}\times\vec{v}_{\text{rot}}) - m\vec{\omega}\times(\vec{\omega}\times\vec{r})$$

| Pseudo-force | Expression | Direction |
|---|---|---|
| Centrifugal | $-m\vec{\omega}\times(\vec{\omega}\times\vec{r})$ | Away from axis |
| Coriolis | $-2m(\vec{\omega}\times\vec{v})$ | Perpendicular to $\vec{v}$ |

### Foucault Pendulum
The pendulum plane rotates with angular velocity:
$$\Omega_z = -\omega\sin\lambda$$
where $\lambda$ is the latitude. Period of rotation at latitude $\lambda$:
$$T = \frac{2\pi}{\omega\sin\lambda} = \frac{24\text{ h}}{\sin\lambda}$$

---

## 7. Rutherford Scattering

The scattering angle $\theta$ for a particle with impact parameter $b$:
$$b = \frac{Z_1 Z_2 e^2}{4\pi\epsilon_0} \cdot \frac{1}{2E}\cot\frac{\theta}{2}$$

Rutherford scattering cross-section:
$$\frac{d\sigma}{d\Omega} = \left(\frac{Z_1 Z_2 e^2}{16\pi\epsilon_0 E}\right)^2 \frac{1}{\sin^4(\theta/2)}$$

---

## 8. Reduced Mass and Two-Body Problem

For two bodies of masses $m_1, m_2$:
$$\mu = \frac{m_1 m_2}{m_1 + m_2}$$

The two-body problem reduces to an equivalent one-body problem with mass $\mu$ and separation $r = r_1 - r_2$.

---

## 9. The Rocket Equation

$$M\frac{dv}{dt} = -v_{\text{rel}}\frac{dM}{dt}$$

Integrating (Tsiolkovsky equation):
$$\Delta v = v_{\text{rel}} \ln\frac{M_0}{M_f}$$
