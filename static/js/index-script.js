const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
        }
    });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));

const cs = getComputedStyle(document.documentElement);
const primary = cs.getPropertyValue('--primary').trim();
const border = cs.getPropertyValue('--border-color').trim();
const text = cs.getPropertyValue('--text-color').trim();
const secondary = cs.getPropertyValue('--secondary').trim();
const success = cs.getPropertyValue('--success').trim();
const warning = cs.getPropertyValue('--warning').trim();
const cardBg = cs.getPropertyValue('--card-bg').trim();

new Chart(document.getElementById('capabilityChart'), {
    type: 'bar',
    data: {
        labels: ['Personalized\nLearning', 'Course\nRecommendation', 'Skill-Gap\nIdentification', 'Continuous\nAssessment', 'Progress\nTracking'],
        datasets: [
            { label: 'Before (manual)', data: [30, 45, 35, 25, 40], backgroundColor: secondary, borderRadius: 6, borderSkipped: false, borderColor: border, borderWidth: 1.5 },
            { label: 'After (BlitzLearn AI)', data: [90, 85, 90, 85, 90], backgroundColor: primary, borderRadius: 6, borderSkipped: false }
        ]
    },
    options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: text, font: { family: 'Inter', size: 11 }, boxWidth: 10, boxHeight: 10 } } },
        scales: {
            x: { ticks: { color: text, font: { size: 10 } }, grid: { display: false } },
            y: { beginAtZero: true, max: 100, ticks: { color: text, font: { size: 10 } }, grid: { color: border } }
        }
    }
});

new Chart(document.getElementById('impactDonut'), {
    type: 'doughnut',
    data: {
        labels: ['Personalized Learning', 'Skill-Gap Identification', 'Competency Improvement', 'Assessment Automation', 'Workforce Analytics'],
        datasets: [{
            data: [30, 25, 20, 15, 10],
            backgroundColor: [primary, '#9F67F0', warning, success, secondary],
            borderColor: cardBg,
            borderWidth: 3
        }]
    },
    options: {
        responsive: true,
        cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { color: text, font: { family: 'Inter', size: 10.5 }, boxWidth: 9, boxHeight: 9, padding: 10 } } }
    }
});