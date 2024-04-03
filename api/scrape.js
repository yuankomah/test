const puppeteerCore = require('puppeteer-core');
const chromeLambda = require('chrome-aws-lambda');
const { parseAsync } = require('json2csv');

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        const { job, minimum, maximum, employment } = req.body;
        const data = await webScraping(job, parseInt(minimum), parseInt(maximum), employment.split(','));

        parseAsync(data, {}).then(csv => {
            res.header('Content-Type', 'text/csv');
            res.attachment('job.csv');
            res.send(csv);
        });
        res.status(200).json({ message: 'Scraping complete' });
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};

async function launchPuppeteer() {
    return await puppeteerCore.launch({
        executablePath: await chromeLambda.executablePath,
        args: chromeLambda.args,
        defaultViewport: chromeLambda.defaultViewport,
        headless: chromeLambda.headless,
    });
}


function filter(employment, jobInput) {
    for (let i = 0; i < employment.length; i++) {
        if (jobInput.toLowerCase().includes(employment[i].toLowerCase())) return true;
    }
    return false;
}

async function webScraping(job, minimum, maximum, employment) {
    const data = [];
    const web = 'https://www.mycareersfuture.gov.sg/search?search=';
    const jobSearch = job.split(' ');
    const webUrl = web + jobSearch.join('%20') + '&sortBy=relevancy&page=';

    const browser = await launchPuppeteer();
    const page = await browser.newPage();

    for (let i = 0; i < 500; i++) {
        const url = webUrl + i.toString();
        await page.goto(url, { waitUntil: 'networkidle2' });

        const jobExist = await page.$('div[id="job-card-0"]');
        if (!jobExist) break;

        for (let j = 0; j < 50; j++) {
            const jobSelector = `#job-card-${j}`;
            const jobExists = await page.$(jobSelector);
            if (!jobExists) break;

            const jobData = await page.evaluate((selector) => {
                const jobCard = document.querySelector(selector);

                const jobCompany = jobCard.querySelector('p[data-testid="company-hire-info"]').innerText;
                const jobTitle = jobCard.querySelector('span[data-testid="job-card__job-title"]').innerText;
                const jobType = jobCard.querySelector('p[data-cy="job-card__employment-type"]').innerText;
                const jobDate = jobCard.querySelector('span[data-cy="job-card-date-info"]').innerText;
                const jobSalary = jobCard.querySelector('div[class*="lh-solid"]').innerText; 
                const jobLinkElement = jobCard.querySelector('a[href]');
                const jobLink = 'https://www.mycareersfuture.gov.sg' + jobLinkElement.getAttribute('href');

                return { jobCompany, jobTitle, jobType, jobDate, jobSalary, jobLink };
            }, jobSelector);

            if (filter(employment, jobData.jobType) === false) continue;

            const [min, max] = jobData.jobSalary.replace(/\$/g, '').replace(/\,/g,'').split('to').map(s => parseInt(s.trim()));
            if (minimum > min || maximum < max) continue;

            jobData.jobSalary.replace('to', ' to ');

            console.log(jobData);
            data.push(jobData);
        }
    }
  
    await browser.close();
    return data;
}

