import React from 'react';
import Head from '../components/head';
import Nav from '../components/nav';

export default () => (
    <div>
        <Head title="Education"/>
        <header>
            <Nav/>
            <h1>Education</h1>
        </header>
        <main>
            <p>I attended <a href="https://www.ec-lyon.fr/">Centrale Lyon</a>, one of the top engineering schools in
                France. Although the school provides a generalist formation, you can pick up a specialisation during the
                last year. I chose <strong>Computer Sciences</strong> and graduated in 2012.</p>
        </main>
    </div>);