export class AvatarVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width = this.canvas.offsetWidth;
        this.height = this.canvas.height = this.canvas.offsetHeight;
        
        this.state = 'idle'; // idle, listening, speaking
        this.psychotype = 'empath'; // empath, optimist, rational
        
        this.particles = [];
        this.animationId = null;
        
        // Colors for psychotypes
        this.colors = {
            empath: { r: 0, g: 184, b: 148 },   // Green
            optimist: { r: 253, g: 203, b: 110 }, // Yellow
            rational: { r: 79, g: 172, b: 254 }   // Blue
        };
        
        this.initParticles();
        this.animate();
        
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        this.width = this.canvas.width = this.canvas.offsetWidth;
        this.height = this.canvas.height = this.canvas.offsetHeight;
        this.initParticles();
    }
    
    setPsychotype(type) {
        if (this.colors[type]) {
            this.psychotype = type;
        }
    }
    
    setState(state) {
        this.state = state;
    }
    
    initParticles() {
        this.particles = [];
        const count = 50;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 3 + 1,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                alpha: Math.random() * 0.5 + 0.1
            });
        }
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        const color = this.colors[this.psychotype];
        const time = Date.now() * 0.001;
        
        // Draw Core Entity
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        let coreRadius = 40;
        let pulseSpeed = 2;
        
        if (this.state === 'speaking') {
            coreRadius = 50 + Math.sin(time * 10) * 10;
            pulseSpeed = 5;
        } else if (this.state === 'listening') {
            coreRadius = 45 + Math.sin(time * 5) * 5;
        } else {
            coreRadius = 40 + Math.sin(time * 2) * 2;
        }
        
        // Glow
        const gradient = this.ctx.createRadialGradient(centerX, centerY, coreRadius * 0.5, centerX, centerY, coreRadius * 2);
        gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`);
        gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, coreRadius * 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Particles
        this.particles.forEach(p => {
            p.x += p.vx * (this.state === 'speaking' ? 5 : 1);
            p.y += p.vy * (this.state === 'speaking' ? 5 : 1);
            
            // Wrap around
            if (p.x < 0) p.x = this.width;
            if (p.x > this.width) p.x = 0;
            if (p.y < 0) p.y = this.height;
            if (p.y > this.height) p.y = 0;
            
            // Draw connection lines to center if close
            const dx = centerX - p.x;
            const dy = centerY - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 100) {
                this.ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${1 - dist/100})`;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(p.x, p.y);
                this.ctx.lineTo(centerX, centerY);
                this.ctx.stroke();
            }
            
            this.ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${p.alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });
        
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize globally
window.avatar = new AvatarVisualizer('avatarCanvas');
