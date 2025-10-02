import streamlit as st
import plotly.graph_objects as go

def test_two_charts():
    st.info("⏱ Rendering portfolio charts (debug)")
    c1, c2 = st.columns(2, gap="large")

    # Chart 1 — allocation demo
    with c1:
        fig1 = go.Figure(data=[go.Pie(labels=["BTC","ETH","XRP"], values=[50,30,20], hole=.5)])
        fig1.update_layout(template="plotly_dark",
                           paper_bgcolor="rgba(0,0,0,0)",
                           plot_bgcolor="rgba(17,24,39,1)",
                           margin=dict(l=10,r=10,t=10,b=10))
        st.plotly_chart(fig1, use_container_width=True, theme=None)

    # Chart 2 — equity curve demo
    with c2:
        fig2 = go.Figure(data=[go.Scatter(x=list(range(20)),
                                          y=[1000 + i*20 + (i%5)*40 for i in range(20)],
                                          mode="lines+markers")])
        fig2.update_layout(template="plotly_dark",
                           paper_bgcolor="rgba(0,0,0,0)",
                           plot_bgcolor="rgba(17,24,39,1)",
                           margin=dict(l=10,r=10,t=10,b=10),
                           xaxis=dict(gridcolor="#334155"), yaxis=dict(gridcolor="#334155"))
        st.plotly_chart(fig2, use_container_width=True, theme=None)
