import React from 'react';
import Head from '../components/head';
import Nav from '../components/nav';

const Home = () => {
    return (
        <div>
            <Head title="About"/>
            <Nav/>
            <main>
                <h1>About</h1>
                <p>
                    Mad about code, I have the luck to live from my passion ! Life has led me to spend one year
                    in <strong>Malaysia</strong>, two in <strong>Vietnam</strong> and four in <strong>Cuba</strong>.
                    Every time the circumstances were different in such a way
                    I could work for big companies, with startup or smaller non profit structures. It has been within a
                    team, remotely or alone; in French, English or Spanish. You will have understood:
                    I <strong>adapt</strong>.
                </p>
                <p>
                    I love to create the architecture of a system and find <strong>simple solutions to complex
                    problems</strong>. I will
                    prefer an adapted solution based on the needs and the constraints over the trend of a technology.
                </p>
                <p>
                    I believe the job goes beyond few lines of code dropped in a text file and must be part of an
                    automated process
                    where <strong>robustness</strong>, <strong>test-ability</strong> and <strong>extensibility</strong> are
                    as important as the source
                    code itself.
                </p>
                <p>
                    This job is very demanding, constantly changing and asks at every moment a great dose
                    of <strong>curiosity</strong>,
                    <strong>humility</strong> and <strong>empathy</strong>. Instead of frightening me, I see these
                    requirements as an opportunity to grow
                    and learn.
                </p>
            </main>
        </div>);
};

export default Home;
